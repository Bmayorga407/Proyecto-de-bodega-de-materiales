import app from './index.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (Unified Local Environment)`);
});
