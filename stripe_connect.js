const Stripe = require('stripe');

// V3 Architecture: Stripe Connect for Marketplace Routing
// This allows us to hold funds in escrow and route 85% to the Engineer and 15% to the Platform.

let stripe = null;

function initStripeConnect() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
        stripe = Stripe(secretKey);
        console.log("💳 [V3 Architecture] Stripe Connect Initialized for Escrow & Payouts.");
    }
    return stripe;
}

async function createEscrowSession(demandId, amountUSD, engineerStripeAccountId) {
    if (!stripe) throw new Error("Stripe not initialized");
    
    // 15% Platform Fee
    const platformFee = Math.round(amountUSD * 100 * 0.15); 
    
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: { name: `Milestone Escrow: Demand #${demandId}` },
                unit_amount: Math.round(amountUSD * 100),
            },
            quantity: 1,
        }],
        mode: 'payment',
        payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: {
                destination: engineerStripeAccountId, // The engineer's connected account
            },
        },
        success_url: `${process.env.DOMAIN}/finance?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${process.env.DOMAIN}/finance?canceled=true`,
    });
    
    return session;
}

module.exports = { initStripeConnect, createEscrowSession };
