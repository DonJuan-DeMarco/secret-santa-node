const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
	santaId: Number,
	recipientId: Number,
});

module.exports = mongoose.model('Assignment', assignmentSchema);
