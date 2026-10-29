const smooth=(low:number,high:number,value:number)=>{
  const t=Math.max(0,Math.min(1,(value-low)/(high-low)));
  return t*t*(3-2*t);
};

/** A continuous visual daylight model, driven by the calculated solar altitude.
 * Brightness/color are illustrative, not atmospheric radiometry or illuminance.
 */
export function lightingForAltitude(altitude:number) {
  const twilight=smooth(-12,0,altitude);
  const daylight=smooth(0,45,altitude);
  const neutral=smooth(0,35,altitude);
  return {
    sunIntensity:3*daylight,
    sunNeutral:neutral,
    ambientIntensity:.34+.38*twilight+.35*daylight,
    ambientTwilight:twilight,
    ambientNeutral:neutral,
    shadowOpacity:.52*smooth(0,18,altitude),
    sunVisibility:smooth(0,3,altitude),
    mapBrightness:.42+.58*smooth(-12,35,altitude),
    mapSaturation:.68+.32*smooth(-12,10,altitude),
    mapSepia:.16*twilight*(1-neutral),
  };
}
