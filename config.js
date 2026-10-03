// Self-hosted runner config, read by .github/workflows/renovate.yml.
// Per-repo behaviour lives in default.json (the shared preset), not here.
module.exports = {
  platform: 'github',
  autodiscover: true,
  autodiscoverFilter: ['openflowfm/*'],
  // Repos without a config get an onboarding PR that adds this renovate.json.
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['github>openflowfm/renovate'],
  },
};
