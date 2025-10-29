
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const multer = require('multer'); // Middleware for handling file uploads
const sharp = require('sharp');   // Library for high-performance image processing

// Initialize the Express app
const app = express();

// --- CORS configuration to allow requests from your React app ---
const corsOptions = {
  origin: 'https://q-gen-nu.vercel.app/'
};
app.use(cors(corsOptions));
app.use(express.json()); // To parse JSON bodies (though form-data is primary now)

// --- Configure Multer for in-memory file storage ---
// This is efficient for small files like icons as it avoids writing to disk.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const PORT = process.env.PORT || 5000;

app.post('/generate', upload.single('icon'), async (req, res) => {
  console.log("Received a request to /generate.");
  
  // Destructure text fields from the request body
  const { content, qrColor, bgColor, size, errorCorrection } = req.body;

  // --- Input Validation ---
  if (!content) {
    return res.status(400).json({ error: 'Content is required to generate a QR code.' });
  }

  try {
    const qrSize = Number(size) || 512;

    // --- QR Code Options ---
    const options = {
      errorCorrectionLevel: errorCorrection || 'H', // 'H' (High) is best for logos
      width: qrSize,
      margin: 1, // Add a bit of margin
      color: {
        dark: qrColor || '#000000',
        light: bgColor || '#FFFFFF',
      },
    };

    // --- Image Processing Logic ---
    let finalQrCodeImage;

    // 1. Generate the base QR code as a Buffer (raw binary data)
    const qrCodeBuffer = await QRCode.toBuffer(content, options);

    if (req.file) {
      // 2. If an icon was uploaded (req.file exists), composite it
      console.log(`Icon received: ${req.file.originalname}`);

      // Calculate the size of the icon (e.g., 25% of the QR code's width)
      const iconSize = Math.floor(qrSize * 0.25);
      
      // Resize the uploaded icon buffer using sharp
      const resizedIconBuffer = await sharp(req.file.buffer)
        .resize({
          width: iconSize,
          height: iconSize,
          fit: 'cover', // Use 'cover' to fill the square space before circling
        })
        .toBuffer();
      
      // --- NEW: Create a circular mask and apply it to the icon ---
      const circleSvg = `
        <svg width="${iconSize}" height="${iconSize}">
          <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${iconSize / 2}" />
        </svg>
      `;
      const circleBuffer = Buffer.from(circleSvg);

      const circularIconBuffer = await sharp(resizedIconBuffer)
        .composite([{
          input: circleBuffer,
          blend: 'dest-in' // This blend mode cuts the icon to the shape of the circle
        }])
        .toBuffer();
      
      // Composite the circular icon onto the center of the QR code
      finalQrCodeImage = await sharp(qrCodeBuffer)
        .composite([{
          input: circularIconBuffer,
          gravity: 'center', // Place it in the middle
        }])
        .toBuffer();
        
    } else {
      // If no icon was uploaded, the final image is just the original QR code
      finalQrCodeImage = qrCodeBuffer;
    }

    // 3. Convert the final image buffer to a Data URL string to be sent to the client
    const qrCodeDataURL = `data:image/png;base64,${finalQrCodeImage.toString('base64')}`;
    
    // 4. Send the successful response
    res.status(200).json({ qrCodeUrl: qrCodeDataURL });

  } catch (err) {
    console.error('Failed to generate QR code:', err);
    res.status(500).json({ error: 'An internal error occurred while generating the QR code.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});