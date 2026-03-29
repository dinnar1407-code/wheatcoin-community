const rpcUrl = 'https://api.mainnet-beta.solana.com';
const txHash = '48DRnHEreG2c8L2Y4jZ9Y5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ8jZ5Lq9xZ'; // Try 88

async function test() {
    let t = txHash.substring(0, 88);
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [t, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
        })
    });
    const data = await response.json();
    console.log(data);
}
test();
