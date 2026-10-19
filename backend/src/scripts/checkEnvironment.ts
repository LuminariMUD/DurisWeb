import { getBackendConfiguration } from '../config/environment.js';

const configuration = getBackendConfiguration();
console.log(
  `Backend configuration is valid. Public population delay: ${configuration.publicPopulationDelayHours} hours.`,
);
