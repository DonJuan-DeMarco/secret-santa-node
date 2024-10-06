const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
	userId: { type: Number, unique: true },
	username: String,
	codeName: String,
	wishList: String,
});

module.exports = mongoose.model('User', userSchema);
