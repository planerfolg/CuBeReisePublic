import { Schema, model } from 'mongoose'
import { Organisation } from '../../common/types.js'

export const organisationSchema = new Schema<Organisation>({
  name: { type: String, trim: true, required: true },
  subfolderPath: { type: String, trim: true, default: '' },
  bankDetails: { type: String },
  companyNumber: { type: String, trim: true },
  logo: { type: Schema.Types.ObjectId, ref: 'DocumentFile' },
  website: { type: String }
})

export default model<Organisation>('Organisation', organisationSchema)
