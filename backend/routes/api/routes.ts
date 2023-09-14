import express from 'express'
const router = express.Router()
import { getter } from '../../helper.js'
import Currency from '../../models/currency.js'
import Country from '../../models/country.js'
import { Country as ICountry } from '../../../common/types.js'
import userRoutes from './user.js'
import travelRoutes from './travel.js'
import documentFileRoutes from './documentFile.js'
import expenseReportRoutes from './expenseReport.js'

router.use('/user', userRoutes)
router.use('/travel', travelRoutes)
router.use('/documentFile', documentFileRoutes)
router.use('/expenseReport', expenseReportRoutes)

router.delete('/logout', function (req, res) {
  req.logout(function (err) {
    if (err) {
      res.status(400).send({ error: err })
    }
  })
  res.send({ status: 'ok' })
})

router.get('/currency', getter(Currency, 'currency', 500))
router.get('/country', async (req, res) => {
  const select: Partial<{ [key in keyof ICountry]: number }> = {}
  if (!req.query.addLumpSums) {
    select.lumpSums = 0
    select.lumpSumsFrom = 0
  }
  delete req.query.addLumpSums
  return getter(Country, 'country', 500, {}, select)(req, res)
})

export default router
