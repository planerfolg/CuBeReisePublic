const mongoose = require('mongoose')

const travelSchema = new mongoose.Schema({
  name: { type: String },
  traveler: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  state: { type: String, required: true, enum: ['rejected', 'appliedFor', 'approved', 'underExamination', 'refunded'], default: 'appliedFor' },
  editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  comment: { type: String },
  reason: { type: String, required: true },
  destinationPlace: {type: String, required: true},
  travelInsideOfEU: {type: Boolean, required: true},
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  advance: {
    amount: { type: Number, min: 0, required: true },
    currency: { type: String, ref: 'Currency', required: true },
  },
  professionalShare: { type: Number, min: 0.5, max: 0.8 },
  claimOvernightLumpSum: { type: Boolean, default: true },
  history: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Travel' }],
  historic: {type: Boolean, required: true, default: false},
  records: [{
    type: { type: String, enum: ['route', 'stay'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startLocation: { type: String },
    endLocation: { type: String },
    distance: {type: Number, min: 0},
    location: { type: String },
    transport: { type: String, enum: ['ownCar', 'airplane', 'shipOrFerry', 'otherTransport'] },
    cost: {
      amount: { type: Number, min: 0 },
      currency: { type: String, ref: 'Currency' },
      receipts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }]
    },
    purpose: { type: String, enum: ['professional', 'mixed', 'private'] },
  }],
  cateringNoRefund: [{
    date: {type: Date, required: true},
    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: false },
    dinner: { type: Boolean, default: false }
  }]
}, {timestamps: true})

travelSchema.pre(/^find((?!Update).)*$/, function () {
  this.populate({ path: 'advance.currency', model: 'Currency' })
  this.populate({ path: 'records.cost.currency', model: 'Currency' })
  this.populate({ path: 'records.cost.receipts', model: 'File', select: {name: 1, type: 1} })
  this.populate({ path: 'traveler', model: 'User', select: {name: 1, email: 1} })
  this.populate({ path: 'editor', model: 'User', select: {name: 1, email: 1} })
})

travelSchema.methods.saveToHistory = async function () {
  const doc = (await mongoose.model('Travel').findOne({ _id: this._id }, { history: 0 })).toObject()
  delete doc._id
  doc.historic = true
  const old = await mongoose.model('Travel').create(doc)
  this.history.push(old)
  this.comment = null
  this.markModified('history')
};

travelSchema.pre('save', function(next) {
  if(this.records.length > 0){
    const oldCateringNoRefund = JSON.parse(JSON.stringify(this.cateringNoRefund))
    const newCateringNoRefund = []
    const dayCount = this.diffInDays(this.records[0].startDate, this.records[this.records.length - 1].endDate) + 1
    for(var i = 0; i < dayCount; i++){
      newCateringNoRefund.push({
        date: new Date(new Date(this.$root.dateToHTMLInputString(this.records[0].startDate)).valueOf() + i * 1000 * 60 * 60 * 24)
      })
    }
    for(const oldCNR of oldCateringNoRefund){
      for(const newCNR of newCateringNoRefund){
        if(new Date(oldCNR.date) - new Date(newCNR.date) == 0){
          Object.assign(newCNR, oldCNR)
          break
        }
      }
    }
    this.cateringNoRefund = newCateringNoRefund
  }else{
    this.cateringNoRefund = []
  }
  next();
});

module.exports = mongoose.model('Travel', travelSchema)
