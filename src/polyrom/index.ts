import { cacheRoms } from './storage';
import * as cores from './cores';

cacheRoms([
  'InterglacticTransmissing.nes',
  'lj65.nes',
]);

console.log(Object.keys(cores));
