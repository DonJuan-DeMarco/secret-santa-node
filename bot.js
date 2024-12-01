require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const User = require('./models/User');
const Assignment = require('./models/Assignment');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const mainMenuKeyboard = {
	reply_markup: {
		keyboard: [
			[{ text: '/wishlist' }, { text: '/rewrite_wishlist' }],
			[{ text: '/my_wishlist' }, { text: '/view_wishlist' }],
			[{ text: '/help' }, { text: '/initiate_draw' }],
			[{ text: '/my_codename' }, { text: '/remind' }],
		],
		resize_keyboard: true,
		one_time_keyboard: false,
	},
};

const pendingWishlists = {};

// Connect to MongoDB
mongoose
	.connect(process.env.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	})
	.then(() => console.log('Connected to MongoDB'))
	.catch((err) => console.error('MongoDB connection error:', err));

bot.on('message', async (msg) => {
	const userId = msg.from.id;
	const chatId = msg.chat.id;

	// Ignore messages that are commands
	if (msg.text.startsWith('/')) {
		return;
	}

	// If the user is not in the pending wish list state, ignore
	const operation = pendingWishlists[userId];
	if (!operation) {
		return;
	}

	// Remove the user from the pending list
	delete pendingWishlists[userId];

	const wishListEntry = msg.text;

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				chatId,
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}

		if (operation === 'append') {
			// Append the new entry to the existing wish list
			if (user.wishList) {
				user.wishList += `\n${wishListEntry}`;
			} else {
				user.wishList = wishListEntry;
			}
		} else if (operation === 'rewrite') {
			// Overwrite the existing wish list
			user.wishList = wishListEntry;
		}

		await user.save();

		bot.sendMessage(
			chatId,
			'Your wish list has been updated.',
			mainMenuKeyboard
		);

		// Notify Secret Santa
		const assignment = await Assignment.findOne({ recipientId: userId });

		if (assignment) {
			bot.sendMessage(
				assignment.santaId,
				'Your recipient has updated their wish list.',
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			chatId,
			'An error occurred while updating your wish list.',
			mainMenuKeyboard
		);
	}
});
bot.onText(/\/my_wishlist/, async (msg) => {
	const userId = msg.from.id;

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				msg.chat.id,
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}

		const wishList = user.wishList || 'You have not set a wish list yet.';
		bot.sendMessage(msg.chat.id, `Your Wish List:\n${wishList}`);
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while retrieving your wish list.'
		);
	}
});

bot.onText(/\/my_codename/, async (msg) => {
	const userId = msg.from.id;

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				msg.chat.id,
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}

		const username =
			user.codeName || 'You have not been assigned a codename yet.';
		bot.sendMessage(msg.chat.id, `Your Code Name:\n${username}`);
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while retrieving your codename.'
		);
	}
});

bot.onText(/\/start/, async (msg) => {
	const chatId = msg.chat.id;
	const userId = msg.from.id;
	const username = msg.from.username;

	try {
		let user = await User.findOne({ userId });

		if (user) {
			bot.sendMessage(
				chatId,
				'You are already registered!',
				mainMenuKeyboard
			);
		} else {
			const codeNames = [
				'Mr. White', //1
				'Mr. Orange', //2
				'Mr. Blonde', //3
				'Mr. Pink', //4
				'Mr. Brown', //5
				'Mr. Blue', //6
				'Mr. Gold', //7
				'Mr. Moss', //8
			];
			const usedCodeNames = await User.find().distinct('codeName');
			const availableCodeNames = codeNames.filter(
				(name) => !usedCodeNames.includes(name)
			);

			if (availableCodeNames.length === 0) {
				bot.sendMessage(
					chatId,
					'No more code names available.',
					mainMenuKeyboard
				);
				return;
			}

			const codeName =
				availableCodeNames[
					Math.floor(Math.random() * availableCodeNames.length)
				];

			user = new User({ userId, username, codeName });
			await user.save();

			bot.sendMessage(
				chatId,
				`Registration successful! Your code name is ${codeName}.`,
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			chatId,
			'An error occurred during registration.',
			mainMenuKeyboard
		);
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
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}

		user.wishList = wishList;
		await user.save();

		bot.sendMessage(
			msg.chat.id,
			'Your wish list has been updated.',
			mainMenuKeyboard
		);

		// Notify Secret Santa
		const assignment = await Assignment.findOne({ recipientId: userId });

		if (assignment) {
			bot.sendMessage(
				assignment.santaId,
				'Your recipient has updated their wish list.',
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while updating your wish list.',
			mainMenuKeyboard
		);
	}
});

bot.onText(/\/rewrite_wishlist$/, async (msg) => {
	const userId = msg.from.id;

	// Check if the user is registered
	const user = await User.findOne({ userId });

	if (!user) {
		bot.sendMessage(
			msg.chat.id,
			'You need to register first using /start.',
			mainMenuKeyboard
		);
		return;
	}

	// Set the user's state to pending wish list entry with 'rewrite' operation
	pendingWishlists[userId] = 'rewrite';

	bot.sendMessage(
		msg.chat.id,
		'Please send your new wish list in the next message. This will overwrite your existing wish list.',
		mainMenuKeyboard
	);
});

bot.onText(/\/wishlist$/, async (msg) => {
	const userId = msg.from.id;

	// Check if the user is registered
	const user = await User.findOne({ userId });

	if (!user) {
		bot.sendMessage(
			msg.chat.id,
			'You need to register first using /start.',
			mainMenuKeyboard
		);
		return;
	}

	// Set the user's state to pending wish list entry with 'append' operation
	pendingWishlists[userId] = 'append';

	bot.sendMessage(
		msg.chat.id,
		'Please send the wish list items you want to add in the next message.',
		mainMenuKeyboard
	);
});

bot.onText(/\/view_wishlist/, async (msg) => {
	const santaId = msg.from.id;

	try {
		const assignment = await Assignment.findOne({ santaId });

		if (!assignment) {
			bot.sendMessage(
				msg.chat.id,
				'You have not been assigned a recipient yet.',
				mainMenuKeyboard
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
				`Recipient Code Name: ${codeName}\nWish List: ${wishList}`,
				mainMenuKeyboard
			);
		} else {
			bot.sendMessage(
				msg.chat.id,
				'Recipient not found.',
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while retrieving the wish list.',
			mainMenuKeyboard
		);
	}
});

bot.onText(/\/reassign_codenames/, async (msg) => {
	const adminId = parseInt(process.env.ADMIN_ID, 10);

	if (msg.from.id !== adminId) {
		bot.sendMessage(
			msg.chat.id,
			'Only the admin can reassign code names.',
			mainMenuKeyboard
		);
		return;
	}

	await reassignCodeNames();

	bot.sendMessage(
		msg.chat.id,
		'Code names have been reassigned.',
		mainMenuKeyboard
	);
});

async function reassignCodeNames() {
	try {
		// Get all users
		const users = await User.find({});

		const codeNames = [
			'Mr. White', //1
			'Mr. Orange', //2
			'Mr. Blonde', //3
			'Mr. Pink', //4
			'Mr. Brown', //5
			'Mr. Blue', //6
			'Mr. Gold', //7
			'Mr. Moss', //8
		];

		if (users.length > codeNames.length) {
			bot.sendMessage(
				parseInt(process.env.ADMIN_ID, 10),
				'Not enough code names to assign to all users.',
				mainMenuKeyboard
			);
			return;
		}

		// Shuffle the code names
		const shuffledCodeNames = codeNames.sort(() => Math.random() - 0.5);

		// Assign code names to users
		for (let i = 0; i < users.length; i++) {
			users[i].codeName = shuffledCodeNames[i];
			await users[i].save();
		}

		// Notify the admin
		bot.sendMessage(
			parseInt(process.env.ADMIN_ID, 10),
			'Code names have been reassigned.',
			mainMenuKeyboard
		);

		// Optionally, notify each user of their new code name
		for (const user of users) {
			bot.sendMessage(
				user.userId,
				`Your new code name is ${user.codeName}.`,
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			parseInt(process.env.ADMIN_ID, 10),
			'An error occurred during code name reassignment.',
			mainMenuKeyboard
		);
	}
}

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
				`You are the Secret Santa for ${codeName}. Use /view_wishlist to see their wish list.`,
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
	}
}
async function assignSecretSantasWithConstraints() {
	try {
		const users = await User.find({});
		const userIds = users.map((user) => user.userId);

		// Define the prohibited pairs
		const prohibitedPairs = [
			[421415422, 460551035],
			[419910057, 346110882],
			[559986856, 600943109],
		];

		// Create a set of prohibited assignments for quick lookup
		const prohibitedAssignments = new Set();
		for (const [a, b] of prohibitedPairs) {
			prohibitedAssignments.add(`${a}:${b}`);
			prohibitedAssignments.add(`${b}:${a}`);
		}

		// Build a map of possible recipients for each Santa
		const possibleRecipientsMap = {};
		for (const santaId of userIds) {
			possibleRecipientsMap[santaId] = userIds.filter((recipientId) => {
				// Exclude self and prohibited pairs
				if (recipientId === santaId) return false;
				if (prohibitedAssignments.has(`${santaId}:${recipientId}`))
					return false;
				return true;
			});
		}

		// Initialize assignments and assigned recipients
		const assignments = {};
		const assignedRecipients = new Set();

		// Recursive function to assign Santas to recipients
		function assign(santas, index) {
			if (index === santas.length) {
				// All Santas have been assigned
				return true;
			}

			const santaId = santas[index];
			const possibleRecipients = possibleRecipientsMap[santaId].filter(
				(recipientId) => !assignedRecipients.has(recipientId)
			);

			for (const recipientId of possibleRecipients) {
				assignments[santaId] = recipientId;
				assignedRecipients.add(recipientId);

				if (assign(santas, index + 1)) {
					return true; // Found a valid assignment
				}

				// Backtrack if assignment is not valid
				assignedRecipients.delete(recipientId);
				delete assignments[santaId];
			}

			return false; // No valid assignment found
		}

		const santas = userIds;
		const success = assign(santas, 0);

		if (!success) {
			console.error('Failed to find a valid assignment.');
			bot.sendMessage(
				parseInt(process.env.ADMIN_ID, 10),
				'Failed to find a valid Secret Santa assignment due to constraints.',
				mainMenuKeyboard
			);
			return;
		}

		// Clear previous assignments
		await Assignment.deleteMany({});

		// Save new assignments to the database
		const assignmentArray = [];
		for (const santaId of santas) {
			const recipientId = assignments[santaId];
			assignmentArray.push({ santaId, recipientId });
		}

		await Assignment.insertMany(assignmentArray);

		// Notify each Santa of their recipient
		for (const assignment of assignmentArray) {
			const recipient = await User.findOne({
				userId: assignment.recipientId,
			});
			const codeName = recipient.codeName;
			bot.sendMessage(
				assignment.santaId,
				`You are the Secret Santa for ${codeName}. Use /view_wishlist to see their wish list.`,
				mainMenuKeyboard
			);
		}
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			parseInt(process.env.ADMIN_ID, 10),
			'An error occurred during the Secret Santa assignment.',
			mainMenuKeyboard
		);
	}
}

bot.onText(/\/initiate_draw/, async (msg) => {
	const adminId = parseInt(process.env.ADMIN_ID, 10);

	if (msg.from.id !== adminId) {
		bot.sendMessage(
			msg.chat.id,
			`adminId:${adminId}/ msg.from.id:${msg.from.id}.\nOnly the admin can initiate the draw.`,
			mainMenuKeyboard
		);
		return;
	}

	// await assignSecretSantas();
	await assignSecretSantasWithConstraints();
	bot.sendMessage(
		msg.chat.id,
		'Secret Santa assignments have been made!',
		mainMenuKeyboard
	);
});

bot.onText(/\/get_naughty/, async (msg) => {
	const userId = msg.from.id;

	const adminId = parseInt(process.env.ADMIN_ID, 10);

	if (userId !== adminId) {
		bot.sendMessage(
			msg.chat.id,
			'Only the admin can reassign code names.',
			mainMenuKeyboard
		);
		return;
	}

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				msg.chat.id,
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}
		const count = getNaughty();

		bot.sendMessage(msg.chat.id, count, mainMenuKeyboard);
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while reminding about wish lists.'
		);
	}
});

bot.onText(/\/remind_all/, async (msg) => {
	const userId = msg.from.id;

	const adminId = parseInt(process.env.ADMIN_ID, 10);

	if (userId !== adminId) {
		bot.sendMessage(
			msg.chat.id,
			'Only the admin can reassign code names.',
			mainMenuKeyboard
		);
		return;
	}

	try {
		const user = await User.findOne({ userId });

		if (!user) {
			bot.sendMessage(
				msg.chat.id,
				'You need to register first using /start.',
				mainMenuKeyboard
			);
			return;
		}
		remindToDrawWishlist();
	} catch (err) {
		console.error(err);
		bot.sendMessage(
			msg.chat.id,
			'An error occurred while reminding about wish lists.'
		);
	}
});

async function getNaughty() {
	try {
		const users = await User.find({});

		const userIds = users.map((user) => user.userId);
		// Массив повідомлень

		// Notify each Santa

		const count = users.filter(
			(user) => user.wishList === '' || !user.wishList
		).length;

		console.log({ count });
		return count;
	} catch (err) {
		console.error(err);
	}
}

async function remindToDrawWishlist() {
	try {
		const users = await User.find({});

		const userIds = users.map((user) => user.userId);
		// Массив повідомлень
		const messages = [
			'Здоров, друже. Ну шо, часу залишилось мало, а то тебе все ніяк не дожену. На носі свята, і прийшов час зіграти в таємного Санту. Так що давай без відмазок: пиши список бажань, інакше сам знаєш, хто до тебе першим прийде з «подарунками». Чекаю, не затягуй! 🎅🎒',
			'Ну шо, друже, свята на носі, а ти ще не встиг визначитися? Не змушуй мене приходити з питаннями особисто. Давай список бажань, і швидко, поки не пізно! 🎅🔦',
			'Ти як там, не замерз у своїх роздумах? Новий рік уже стукає у двері, а твої бажання досі в невідомості. Не мучай Санту, пиши, що хочеш, інакше будеш сам собі подарунки майструвати. 🎅💀',
			'Ну шо, зник кудись? Свято наближається, і чекати вже нема коли. Пиши список, поки я не вирішив, що тобі й пустої коробки вистачить! 🎅💼',
			'Друже, годі шифруватись. Новий рік — це не те, що можна проігнорувати. Давай, кидай список, інакше Санта може помилитися і надіслати щось зовсім не те. 🎅👀',
			'Ну, як ти там? Не ховайся, час бажань і подарунків настав. Давай список того, що тобі треба, бо в мене вже закінчується терпіння і з’являється натяк на творчість. 🎅☢️',
			'Слухай, не уникай розмови, як завжди. Святковий час — це час для бажань. Напиши, що хочеш, інакше отримаєш те, що придумається Санті на ходу. 🎅🗺️',
		];

		// Notify each Santa
		for (const user of userIds) {
			const randomMessage =
				messages[Math.floor(Math.random() * messages.length)];

			console.log({ user, randomMessage });
			bot.sendMessage(user, randomMessage, mainMenuKeyboard);
		}
	} catch (err) {
		console.error(err);
	}
}

bot.setMyCommands([
	{ command: 'start', description: 'Зареєструватися у грі.' },
	{ command: 'help', description: 'Показати допоміжне повідомлення.' },
	{ command: 'wishlist', description: 'Оновити існуючий список бажань.' },
	{
		command: 'view_wishlist',
		description: 'Глянути список бажань рецепієнта (після розподілу).',
	},
	{ command: 'my_wishlist', description: 'Глянути власний список.' },
	{ command: 'my_codename', description: "Глянути власне кодове ім'я." },
	{
		command: 'get_naughty',
		description: 'Глянути кількість бідолаг.',
	},
	{
		command: 'rewrite_wishlist',
		description: 'Переписати список бажань заново.',
	},
	{ command: 'initiate_draw', description: 'Розпочати розподіл (адмін).' },
	{ command: 'remind_all', description: 'Нагадати всім (адмін).' },
	{
		command: 'reassign_codenames',
		description: 'Перепризначити кодові імена (адмін).',
	},
]);

bot.onText(/\/help/, (msg) => {
	const helpMessage = `
  Welcome to the Secret Santa Bot!
  
  Доступні команди:
  /start - Зареєструватися у грі.
  /wishlist - Оновити список бажань.
  /view_wishlist - Глянути список бажань рецепієнта (після розподілу).
  /help - Показати дане повідомлення.
  /initiate_draw - Розпочати розподіл.
  /my_wishlist - Глянути власний список.
  /my_codename -  Глянути власне кодове ім'я.
  /rewrite_wishlist - Переписати список бажань заново.
  /reassign_codenames - Перепризначити кодові імена (адмін).
  `;

	bot.sendMessage(msg.chat.id, helpMessage, mainMenuKeyboard);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection:', reason);
});

bot.on('polling_error', (error) => {
	console.error('Polling Error:', error.code);
});
