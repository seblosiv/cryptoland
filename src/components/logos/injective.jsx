/**
 * Injective — the official brand mark, rendered monochrome.
 * Real path data from the official Injective logomark: two 180°-rotated hooks.
 * The source paints both halves with the SAME gradient — colour was never used
 * to separate them — so both stay full-opacity currentColor and read as one
 * continuous interlocking form. The gradient defs are dropped.
 */
export default function InjectiveLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Injective logo">
      <path
        fill="currentColor"
        d="M48.5,69.1C51,66,53.6,63,56.2,60c0.1-0.1,0.4-0.2,0.5-0.3c0.2-0.3,0.6-0.5,0.9-0.8l0.2-0.3c1.8-1.7,3.8-3.5,6-5.2c8-6,16.2-10.6,24.9-13.7c28-9.8,59.1-3.8,83.5,19.3c34.1,31.9,31,83.4,3.8,117.6c-34.4,51-93.4,122.1-11.7,185.8c14.7,11.5,25.6,20.9,71.9,34.3c-30.3,5.6-58.4,3.8-89.6-4.1c-22.1-12.5-56.9-39.2-68.7-75.3c-17.9-54.7,31.5-136.6,55.3-168.1c32.7-43.6-20.2-90.8-59.3-38.1C53.7,138.6,18,216.3,30.4,274c7.2,32.7,16.9,56.5,55.2,89.3c-7.1-4.2-14-8.9-20.7-14.3C-24,266.1-13.7,137.9,48.5,69.1z"
      />
      <path
        fill="currentColor"
        d="M351.5,330.9c-2.5,3.1-5.1,6.1-7.7,9.1c-0.1,0.1-0.4,0.2-0.5,0.3c-0.2,0.3-0.6,0.5-0.9,0.8l-0.2,0.3c-1.8,1.7-3.8,3.5-6,5.1c-8,6-16.2,10.6-24.9,13.7c-28,9.8-59.1,3.8-83.5-19.3c-34.1-31.9-31-83.4-3.8-117.6c34.4-51,93.4-122.1,11.7-185.8c-14.7-11.5-25.6-20.9-71.9-34.3c30.3-5.6,58.4-3.8,89.6,4.1c22.1,12.5,56.9,39.2,68.7,75.3c17.9,54.7-31.5,136.6-55.3,168.1c-32.7,43.6,20.2,90.8,59.3,38.1c20.4-27.5,56.1-105.2,43.7-162.9c-7.2-32.7-16.9-56.5-55.2-89.3c7.1,4.2,14,8.9,20.7,14.3C424,133.9,413.7,262.1,351.5,330.9z"
      />
    </svg>
  )
}
