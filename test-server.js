import express from 'express';
const app = express();
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Test server works!' }));
app.listen(3000, '0.0.0.0', () => {
  console.log('✅ Test server running on http://0.0.0.0:3000');
});
