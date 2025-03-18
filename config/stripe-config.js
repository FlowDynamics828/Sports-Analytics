require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Stripe secret key missing from environment variables');
    process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Ensure proper configuration of Stripe
const configureStripe = () => {
    return stripe;
};

module.exports = configureStripe;