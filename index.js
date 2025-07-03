require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://lead-score.netlify.app', credentials: true }));;
app.use(express.json());

// Health check route for Render
app.get('/', (req, res) => {
  res.send('Lead Analysis API is running');
});

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define your Lead schema/model
const leadSchema = new mongoose.Schema({}, { strict: false, collection: 'submitforms' });
const Lead = mongoose.model('Lead', leadSchema);

// Reusable lead scoring function
function calculateLeadScore(lead) {
  const maxScore = 100;
  let score = 0;
  // Set percentage to 90 by default for Nursery/LKG/UKG
  let percent = 0;
  const lowerClass = (lead.class || '').toLowerCase();
  if (lowerClass.includes('nursery') || lowerClass.includes('lkg') || lowerClass.includes('ukg')) {
    percent = 90;
  } else if (lead.lastClassPercentage) {
    percent = parseInt((lead.lastClassPercentage + '').replace('%', ''));
  }
  if (percent >= 90) score += 20;
  else if (percent >= 80) score += 10;

  // Sibling in school
  if (lead.siblingInSchool === "Yes") score += 25;

  // Referral source
  if (["Sibling", "Friend", "Alumni"].includes(lead.howYouKnowUs)) score += 15;
  else if (lead.howYouKnowUs === "Social Media") score += 5;

  // Applied year
  if (lead.appliedYear === "2024") score += 10;

  // Status (if available)
  if (lead.status === "Applied") score += 20;
  else if (lead.status === "Visited") score += 10;

  // Increase score by 30, but cap at maxScore
  score += 30;
  if (score > maxScore) score = maxScore;

  // Normalize score to 0-100
  return Math.round((score / maxScore) * 100);
}

// Example: Fetch all leads
app.get('/api/leads', async (req, res) => {
  const leads = await Lead.find({});
  res.json(leads);
});

// Example: Lead scoring endpoint
app.get('/api/leads/score', async (req, res) => {
  const leads = await Lead.find({});
  const scoredLeads = leads.map(lead => ({ ...lead._doc, leadScore: calculateLeadScore(lead) }));
  res.json(scoredLeads);
});

// Analytics endpoint for dashboard charts
app.get('/api/analytics', async (req, res) => {
  const leads = await Lead.find({});
  let totalLeads = leads.length;
  let hotLeads = 0, warmLeads = 0, coldLeads = 0, scoreSum = 0;
  const scoreDistribution = { "90-100": 0, "80-89": 0, "50-79": 0, "0-49": 0 };
  const classDistribution = {};

  leads.forEach(lead => {
    const score = calculateLeadScore(lead);
    scoreSum += score;
    if (score >= 90) scoreDistribution["90-100"]++;
    else if (score >= 80) scoreDistribution["80-89"]++;
    else if (score >= 50) scoreDistribution["50-79"]++;
    else scoreDistribution["0-49"]++;

    if (score >= 80) hotLeads++;
    else if (score >= 50) warmLeads++;
    else coldLeads++;

    const className = lead.class || 'Unknown';
    classDistribution[className] = (classDistribution[className] || 0) + 1;
  });

  const averageScore = totalLeads > 0 ? Math.round((scoreSum / totalLeads) * 100) / 100 : 0;

  res.json({
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    scoreDistribution,
    classDistribution,
    averageScore
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));