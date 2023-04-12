const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema({
  data: {type: Buffer},
  type: {type: String, enum: ['image/jpeg', 'image/png', 'application/pdf']},
  name: {type: String}
})


module.exports = mongoose.model('File', fileSchema)
