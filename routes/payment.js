const express = require('express');
const router = express.Router();
const stripe = require('../stripe-config');

router.post('/create-subscription', async (req, res) => {
    try {
        const { email, paymentMethodId, priceId } = req.body;

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
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            payment_settings: {
                payment_method_types: ['card'],
                save_default_payment_method: 'on_subscription'
            },
            expand: ['latest_invoice.payment_intent']
        });

        res.json({
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret
        });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;                    
                 