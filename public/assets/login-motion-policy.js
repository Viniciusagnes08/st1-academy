export const motionPreferenceKey='st1-academy.motion';

export function motionState(value,reducedMotion){
  const preference=value==='full'?'full':'auto';
  return {preference,enabled:preference==='full'||(preference==='auto'&&!reducedMotion)};
}
