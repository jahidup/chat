const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderEmail: { type: String, required: true, index: true },
  receiverEmail: { type: String, required: true, index: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
