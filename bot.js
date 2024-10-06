require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const User = require('./models/User');
const Assignment = require('./models/Assignment');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Connect to MongoDB
mongoose
	.connect(process.env.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	})
	.then(() => console.log('Connected to MongoDB'))
	.catch((err) => console.error('MongoDB connection error:', err));

bot.onText(/\/start/, async (msg) => {
	const userId = msg.from.id;
	const username = msg.from.username;

	try {
		let user = await User.findOne({ userId });

		if (user) {
			bot.sendMessage(msg.chat.id, 'You are already registered!');
		} else {
			const codeNames = [
				'Mr. White',
				'Mr. Orange',
				'Mr. Blonde',
				'Mr. Pink',
				'Mr. Brown',
				'Mr. Blue',
			];
			const usedCodeNames = await User.find().distinct('codeName');
			const availableCodeNames = codeNames.filter(
				(name) => !usedCodeNames.includes(name)
			);

			if (availableCodeNames.length === 0) {
				bot.sendMessage(msg.chat.id, 'No more code names available.');
				return;
			}

			const codeName =
				availableCodeNames[
					Math.floor(Math.random() * availableCodeNames.length)
				];

			user = new User({ userId, username, codeName });
			await user.save();

			bot.sendMessage(
				msg.chat.id,
				`Registration successful! Your code name is ${codeName}.`
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(msg.chat.id, 'An error occurred during registration.');
	}
});

bot.onText(/\/wishlist (.+)/, async (msg, match) => {
	const userId = msg.from.id;
	const wishList = match[1];

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				msg.chat.id,
				'You need to register first using /start.'
			);
			return;
		}

		user.wishList = wishList;
		await user.save();

		bot.sendMessage(msg.chat.id, 'Your wish list has been updated.');

		// Notify Secret Santa
		const assignment = await Assignment.findOne({ recipientId: userId });

		if (assignment) {
			bot.sendMessage(
				assignment.santaId,
				'Your recipient has updated their wish list.'
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while updating your wish list.'
		);
	}
});

bot.onText(/\/wishlist$/, (msg) => {
	bot.sendMessage(
		msg.chat.id,
		'Please provide your wish list after the command.'
	);
});

bot.onText(/\/view_wishlist/, async (msg) => {
	const santaId = msg.from.id;

	try {
		const assignment = await Assignment.findOne({ santaId });

		if (!assignment) {
			bot.sendMessage(
				msg.chat.id,
				'You have not been assigned a recipient yet.'
			);
			return;
		}

		const recipient = await User.findOne({
			userId: assignment.recipientId,
		});

		if (recipient) {
			const codeName = recipient.codeName;
			const wishList = recipient.wishList || 'No wish list yet.';
			bot.sendMessage(
				msg.chat.id,
				`Recipient Code Name: ${codeName}\nWish List: ${wishList}`
			);
		} else {
			bot.sendMessage(msg.chat.id, 'Recipient not found.');
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while retrieving the wish list.'
		);
	}
});

async function assignSecretSantas() {
	try {
		const users = await User.find({});
		const userIds = users.map((user) => user.userId);
		const recipients = [...userIds];

		// Shuffle recipients
		for (let i = recipients.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[recipients[i], recipients[j]] = [recipients[j], recipients[i]];
		}

		// Ensure no one is assigned to themselves
		for (let i = 0; i < userIds.length; i++) {
			if (userIds[i] === recipients[i]) {
				const nextIndex = (i + 1) % userIds.length;
				[recipients[i], recipients[nextIndex]] = [
					recipients[nextIndex],
					recipients[i],
				];
			}
		}

		// Clear previous assignments
		await Assignment.deleteMany({});

		// Create new assignments
		const assignments = userIds.map((santaId, index) => ({
			santaId,
			recipientId: recipients[index],
		}));

		await Assignment.insertMany(assignments);

		// Notify each Santa
		for (const assignment of assignments) {
			const recipient = await User.findOne({
				userId: assignment.recipientId,
			});
			const codeName = recipient.codeName;
			bot.sendMessage(
				assignment.santaId,
				`You are the Secret Santa for ${codeName}. Use /view_wishlist to see their wish list.`
			);
		}
	} catch (err) {
		console.error(err);
	}
}

bot.onText(/\/initiate_draw/, async (msg) => {
	const adminId = parseInt(process.env.ADMIN_ID, 10);

	if (msg.from.id !== adminId) {
		bot.sendMessage(
			msg.chat.id,
			`adminId:${adminId}/ msg.from.id:${msg.from.id}.\nOnly the admin can initiate the draw.`
		);
		return;
	}

	await assignSecretSantas();
	bot.sendMessage(msg.chat.id, 'Secret Santa assignments have been made!');
});

bot.onText(/\/help/, (msg) => {
	const helpMessage = `
  Welcome to the Secret Santa Bot!
  
  Available commands:
  /start - Register for the Secret Santa game.
  /wishlist <your wish list> - Set or update your wish list.
  /view_wishlist - View your recipient's wish list (after assignments).
  /help - Show this help message.
  /initiate_draw - Розпочати розподіл
  `;

	bot.sendMessage(msg.chat.id, helpMessage);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection:', reason);
});

bot.on('polling_error', (error) => {
	console.error('Polling Error:', error.code);
});
