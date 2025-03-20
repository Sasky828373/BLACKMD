const qrcode = require('qrcode-terminal');
const qr = require('qrcode');
const http = require('http');

// Generate a simple test QR code for the terminal
console.clear();
qrcode.generate('Test QR Code', {}, (qr) => {
    console.log('If you can see a QR code below, your terminal supports QR display:\n');
    console.log('\n\n');
    console.log(qr);
});

// Create a simple HTTP server to display the QR code in a browser
const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    
    const qrDataURL = await qr.toDataURL('Test QR Code in Browser', { 
        width: 300,
        margin: 2,
        color: {
            dark: '#128C7E',  // WhatsApp green color for the QR
            light: '#FFFFFF'  // White background
        }
    });
    
    const html = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>QR Code Test</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center;
                        margin-top: 50px;
                        background-color: #f5f5f5;
                    }
                    h1 { color: #128C7E; }
                    .container {
                        max-width: 500px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: white;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .qr-container {
                        background-color: white;
                        padding: 20px;
                        border-radius: 10px;
                        display: inline-block;
                        margin: 20px 0;
                    }
                    .footer {
                        margin-top: 20px;
                        color: #666;
                        font-size: 0.9em;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>QR Code Test</h1>
                    <p>This is a test QR code to confirm the web display is working correctly.</p>
                    <div class="qr-container">
                        <img src="${qrDataURL}" alt="QR Code">
                    </div>
                    <p>When connecting to WhatsApp, a unique QR code will be displayed here.</p>
                    <div class="footer">
                        <p>WhatsApp Bot QR Code System</p>
                    </div>
                </div>
            </body>
        </html>
    `;
    
    res.end(html);
});

// Use a different port for the test QR code server to avoid conflicts with the main QR server
const PORT = 5007;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`QR Code test server running at http://localhost:${PORT}`);
});