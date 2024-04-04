import axios from 'axios'
import { NextFunction, Request, Response } from 'express'
import { Schema, SchemaDefinition, SchemaTypeOptions, Types } from 'mongoose'
import { ExchangeRate as ExchangeRateI, Locale, baseCurrency, emailRegex } from '../common/types.js'
import i18n from './i18n.js'
import DocumentFile from './models/documentFile.js'
import ExchangeRate from './models/exchangeRate.js'

export function objectsToCSV(objects: any[], separator = '\t', arraySeparator = ', '): string {
  var keys: string[] = []
  for (const obj of objects) {
    const oKeys = Object.keys(obj)
    if (keys.length < oKeys.length) {
      keys = oKeys
    }
  }
  var str = keys.join(separator) + '\n'
  for (const obj of objects) {
    const col: string[] = []
    for (const key of keys) {
      if (!(key in obj)) {
        col.push('')
      } else if (Array.isArray(obj[key])) {
        col.push('[' + obj[key].join(arraySeparator) + ']')
      } else if (obj[key] === null) {
        col.push('null')
      } else {
        col.push(obj[key])
      }
    }
    str += col.join(separator) + '\n'
  }
  return str
}

type InforEuroResponse = Array<{
  country: string
  currency: string
  isoA3Code: string
  isoA2Code: string
  value: number
  comment: null | string
}>

export async function convertCurrency(
  date: Date | string | number,
  amount: number,
  from: string,
  to: string = baseCurrency._id
): Promise<{ date: Date; rate: number; amount: number } | null> {
  if (from === to) {
    return null
  }
  var convertionDate = new Date(date)
  if (convertionDate.valueOf() - new Date().valueOf() > 0) {
    convertionDate = new Date()
  }
  const month = convertionDate.getUTCMonth() + 1
  const year = convertionDate.getUTCFullYear()
  var data: ExchangeRateI | null | undefined = await ExchangeRate.findOne({ currency: from.toUpperCase(), month: month, year: year }).lean()
  if (!data && !(await ExchangeRate.findOne({ month: month, year: year }).lean())) {
    const url = `https://ec.europa.eu/budg/inforeuro/api/public/monthly-rates?lang=EN&year=${year}&month=${month}`
    const res = await axios.get(url)
    if (res.status === 200) {
      const rates = (res.data as InforEuroResponse).map(
        (r) => ({ currency: r.isoA3Code, value: r.value, month: month, year: year } as ExchangeRateI)
      )
      ExchangeRate.insertMany(rates)
      data = rates.find((r) => r.currency === from.toUpperCase())
    }
  }
  if (!data) {
    return null
  }
  const rate = data.value
  amount = Math.round((amount / rate) * 100) / 100
  return { date: convertionDate, rate, amount }
}

export function costObject(
  exchangeRate = true,
  receipts = true,
  required = false,
  defaultCurrency: string | null = null,
  defaultAmount: number | null = null
) {
  const type: any = {
    amount: { type: Number, min: 0, required: required, default: defaultAmount }
  }
  if (exchangeRate) {
    type.exchangeRate = {
      date: { type: Date },
      rate: { type: Number, min: 0 },
      amount: { type: Number, min: 0 }
    }
    type.currency = { type: String, ref: 'Currency', required: required, default: defaultCurrency }
  }
  if (receipts) {
    type.receipts = { type: [{ type: Schema.Types.ObjectId, ref: 'DocumentFile', required: required }] }
    type.date = {
      type: Date,
      validate: {
        validator: (v: Date | string | number) => new Date().valueOf() >= new Date(v).valueOf(),
        message: 'futureNotAllowed'
      },
      required: required
    }
  }
  return { type, required, default: () => ({}) }
}

type FileHandleOptions = { checkOwner?: boolean; owner?: string | Types.ObjectId; multiple?: boolean }
export function documentFileHandler(pathToFiles: string[], options: FileHandleOptions = {}) {
  const opts = Object.assign({ checkOwner: true, multiple: true }, options)
  return async (req: Request, res?: Response, next?: NextFunction) => {
    const fileOwner = opts.owner ? opts.owner : req.user?._id
    if (!fileOwner) {
      throw new Error('No owner for uploaded files')
    }
    var pathExists = true
    var tmpCheckObj = req.body
    for (const prop of pathToFiles) {
      if (tmpCheckObj[prop]) {
        tmpCheckObj = tmpCheckObj[prop]
      } else {
        pathExists = false
        break
      }
    }
    if (pathExists && ((Array.isArray(tmpCheckObj) && req.files && opts.multiple) || (!opts.multiple && req.file))) {
      let reqDocuments = tmpCheckObj
      function multerFileName(i: number) {
        var str = pathToFiles.length > 0 ? pathToFiles[0] : ''
        for (var j = 1; j < pathToFiles.length; j++) {
          str += '[' + pathToFiles[j] + ']'
        }
        str += '[' + i + '][data]'
        return str
      }
      async function handleFile(reqDoc: any) {
        if (!reqDoc._id) {
          var buffer = null
          if (opts.multiple) {
            for (const file of req.files as Express.Multer.File[]) {
              if (file.fieldname == multerFileName(i + iR)) {
                buffer = file.buffer
                break
              }
            }
          } else {
            buffer = req.file!.buffer
          }
          if (buffer) {
            reqDoc.owner = fileOwner
            reqDoc.data = buffer
            reqDoc = await new DocumentFile(reqDoc).save()
          } else {
            return undefined
          }
        } else {
          const documentFile = await DocumentFile.findOne({ _id: reqDoc._id }, { owner: 1 }).lean()
          if (!documentFile || (opts.checkOwner && !documentFile.owner.equals(fileOwner))) {
            return undefined
          }
        }
        return reqDoc._id
      }
      if (opts.multiple) {
        var iR = 0 // index reduction
        for (var i = 0; i < reqDocuments.length; i++) {
          const resultId = await handleFile(reqDocuments[i])
          if (resultId) {
            reqDocuments[i] = resultId
          } else {
            reqDocuments.splice(i, 1)
            i -= 1
            iR += 1
          }
        }
      } else {
        reqDocuments = await handleFile(reqDocuments)
      }
      console.log(reqDocuments)
    }
    if (next) {
      next()
    }
  }
}

function mapSchemaTypeToVueformElement(schemaType: SchemaTypeOptions<any>, language: Locale, labelStr?: string, assignment = {}) {
  if (schemaType.hide) {
    return
  }
  const vueformElement = Object.assign({ rules: ['nullable'] }, assignment) as any

  if (schemaType.required) {
    vueformElement['rules'].splice(vueformElement['rules'].indexOf('nullable'), 1)
    vueformElement['rules'].push('required')
  }
  if (schemaType.min !== undefined) {
    vueformElement['rules'].push('min:' + schemaType.min)
  }
  if (schemaType.max !== undefined) {
    vueformElement['rules'].push('max:' + schemaType.max)
  }

  if (schemaType.label) {
    vueformElement['label'] = i18n.t(schemaType.label, { lng: language })
  } else if (labelStr) {
    vueformElement['label'] = i18n.t('labels.' + labelStr, { lng: language })
  }
  if (schemaType.info) {
    vueformElement['info'] = i18n.t(schemaType.info, { lng: language })
  }
  if (isFlatType(schemaType.type) && schemaType.default !== undefined) {
    vueformElement['default'] = schemaType.default
  }

  if (schemaType.ref) {
    vueformElement['type'] = schemaType.ref.toString().toLowerCase()
  } else if (schemaType.type === String) {
    if (schemaType.enum && Array.isArray(schemaType.enum)) {
      vueformElement['type'] = 'select'
      const items: any = {}
      for (const value of schemaType.enum) {
        items[value!] = i18n.t('labels.' + value, { lng: language })
      }
      vueformElement['items'] = items
    } else {
      vueformElement['type'] = 'text'
      if (schemaType.validate === emailRegex) {
        vueformElement['rules'].push('email')
      }
    }
  } else if (schemaType.type === Number) {
    vueformElement['type'] = 'text'
    vueformElement['input-type'] = 'number'
    vueformElement['force-numbers'] = true
  } else if (schemaType.type === Date) {
    vueformElement['type'] = 'date'
    vueformElement['time'] = Boolean(schemaType.time)
  } else if (schemaType.type === Boolean) {
    vueformElement['type'] = 'checkbox'
    vueformElement['text'] = vueformElement['label']
    delete vueformElement['label']
  } else if (Array.isArray(schemaType.type)) {
    if (schemaType.type[0].type === undefined && typeof schemaType.type[0] === 'object') {
      vueformElement['type'] = 'list'
      vueformElement['object'] = mongooseSchemaToVueformSchema(schemaType.type[0], language)
    } else if (schemaType.type[0].ref) {
      vueformElement['type'] = schemaType.type[0].ref.toString().toLowerCase()
      vueformElement['multiple'] = true
    } else {
      vueformElement['type'] = 'list'
      vueformElement['element'] = mapSchemaTypeToVueformElement(schemaType.type[0], language, labelStr)
    }
  } else if (typeof schemaType.type === 'object') {
    const keys = Object.keys(schemaType.type).filter((key) => !schemaType.type[key].hide)
    vueformElement['type'] = 'object'
    if (keys.length > 1 && isFlatObject(schemaType.type)) {
      vueformElement['schema'] = mongooseSchemaToVueformSchema(schemaType.type, language, {
        columns: { lg: { container: 12 / (keys.length == 2 ? 2 : 3) }, sm: { container: 6 } }
      })
    } else {
      vueformElement['schema'] = mongooseSchemaToVueformSchema(schemaType.type, language)
    }
  } else {
    throw new Error('No Type for conversion found for:' + schemaType.type)
  }
  return vueformElement
}

function isCheckboxGroup(mongooseSchema: SchemaDefinition | any) {
  return !Object.keys(mongooseSchema).some((path) => (mongooseSchema[path] as SchemaTypeOptions<any>).type !== Boolean)
}

function isFlatObject(mongooseSchema: SchemaDefinition | any) {
  return !Object.keys(mongooseSchema).some((path) => !isFlatType((mongooseSchema[path] as SchemaTypeOptions<any>).type))
}

function isFlatType(type: SchemaTypeOptions<any>['type']) {
  return type === Boolean || type === String || type === Number || type === Date
}

export function mongooseSchemaToVueformSchema(mongooseSchema: SchemaDefinition | any, language: Locale, assignment = {}) {
  const vueformSchema: any = {}
  for (const path in mongooseSchema) {
    const prop = mongooseSchema[path] as SchemaTypeOptions<any>
    vueformSchema[path] = mapSchemaTypeToVueformElement(prop, language, path, assignment)
  }

  return vueformSchema
}
