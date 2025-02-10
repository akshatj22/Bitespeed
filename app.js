const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize'); 
const Contact = require('./models/Contact');
const sequelize = require('./config/database');

const app = express();
app.use(bodyParser.json());

// Debugging logs
console.log('Contact Model:', Contact);
console.log('Sequelize Instance:', sequelize);


sequelize.authenticate()
    .then(() => {
        console.log('Database connected');
    })
    .catch((err) => {
        console.error('Database connection error:', err);
    });


sequelize.sync().then(() => {
    console.log('Database synced');
}).catch((err) => {
    console.error('Database sync error:', err);
});

app.post('/identify', async (req, res) => {
    console.log('Request Body:', req.body);
    const { email, phoneNumber } = req.body;

    try {
        //  Find existing contacts
        const existingContacts = await Contact.findAll({
            where: {
                [Op.or]: [
                    { email },
                    { phoneNumber },
                ],
            },
        });
        console.log('Existing Contacts:', existingContacts.map(c => c.toJSON()));

        //  Determine primary contact
        const primaryContact = await determinePrimaryContact(existingContacts);
        console.log('Primary Contact:', primaryContact?.toJSON());

        //  Link new contact
        const newContact = await createOrLinkContact(email, phoneNumber, primaryContact);
        console.log('New Contact:', newContact?.toJSON());

        //  Merge contact information
        const allContacts = await getAllLinkedContacts(primaryContact || newContact);
        const emails = [...new Set(allContacts.map(c => c.email).filter(Boolean))];
        const phoneNumbers = [...new Set(allContacts.map(c => c.phoneNumber).filter(Boolean))];

        //  Prepare response
        res.json({
            primaryContactId: (primaryContact || newContact).id,
            emails,
            phoneNumbers,
            secondaryContactIds: allContacts.filter(c => c.id !== (primaryContact || newContact).id).map(c => c.id),
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions
async function determinePrimaryContact(contacts) {
    // Extract all primary contacts from the list
    const primaryContacts = contacts.filter(c => c.linkPrecedence === 'primary');

    if (primaryContacts.length === 0) {
        return null; // No primary contact not found
    }

    // Select the oldest primary contact
    return primaryContacts.reduce((oldest, current) => {
        return oldest.createdAt < current.createdAt ? oldest : current;
    });
}

async function createOrLinkContact(email, phoneNumber, primaryContact) {
    if (!primaryContact) {
        // No existing primary contact: create a new one
        return await Contact.create({
            email,
            phoneNumber,
            linkPrecedence: 'primary',
        });
    }

    // Check if the email/phone exists in other contacts (excluding the primary)
    const existingContact = await Contact.findOne({
        where: {
            [Op.or]: [
                { email },
                { phoneNumber },
            ],
            id: { [Op.ne]: primaryContact.id }, // Exclude the primary contact
        },
    });

    if (existingContact) {
        // Convert existing primary to secondary if needed
        if (existingContact.linkPrecedence === 'primary') {
            await existingContact.update({
                linkPrecedence: 'secondary',
                linkedId: primaryContact.id,
            });
        }
        return existingContact;
    }

    // Create a new secondary contact linked to the primary
    return await Contact.create({
        email,
        phoneNumber,
        linkedId: primaryContact.id,
        linkPrecedence: 'secondary',
    });
}

async function getAllLinkedContacts(primaryContact) {
    return await Contact.findAll({
        where: {
            [Op.or]: [
                { id: primaryContact.id },
                { linkedId: primaryContact.id },
            ],
        },
    });
}

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});