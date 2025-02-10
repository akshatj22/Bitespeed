// sync.js
const sequelize = require('./config/database');
const Contact = require('./models/Contact');

sequelize.sync({ force: true }).then(() => {
    console.log('Database synced');
});