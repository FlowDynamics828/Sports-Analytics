// routes/payment.js
const express = require('express');
const router = express.Router();
const stripe = require('../stripe-config');

// Define price IDs from your Stripe dashboard
const PRICE_IDS = {
    basic: 'price_basic_live_9_99',        
    pro: 'price_pro_live_24_99',
    enterprise: 'price_enterprise_live_99_99'
};

router.post('/create-subscription', async (req, res) => {
    try {
        const { email, paymentMethodId, subscription } = req.body;
        const priceId = PRICE_IDS[subscription];

        // Create or get customer
        const customers = await stripe.customers.list({
            email: email,
            limit: 1
        });
        
        let customer;
        if (customers.data.length) {
            customer = customers.data[0];
        } else {
            customer = await stripe.customers.create({
                email: email,
                payment_method: paymentMethodId,
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });
        }

        // Create subscription
        const subscriptionData = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            payment_settings: {
                payment_method_types: ['card'],
                save_default_payment_method: 'on_subscription'
            },
            expand: ['latest_invoice.payment_intent'],
            metadata: {
                subscriptionType: subscription
            }
        });

        res.json({
            subscriptionId: subscriptionData.id,
            clientSecret: subscriptionData.latest_invoice.payment_intent.client_secret
        });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;