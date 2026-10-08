import type { IconProps } from "./icon-types";

type DuoIconProps = IconProps & {
  secondaryFill?: string;
};

export function GlobeOutlineIcon({
  height,
  size = "1em",
  strokeWidth = 2,
  title,
  width,
  ...props
}: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <ellipse
        cx="10"
        cy="10"
        rx="7"
        ry="2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></ellipse>
      <ellipse
        cx="10"
        cy="10"
        rx="2.5"
        ry="7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></ellipse>
      <circle
        cx="10"
        cy="10"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></circle>
    </svg>
  );
}
export function GlobeFillDuo3Icon({
  height,
  secondaryFill,
  size = "1em",
  strokeWidth = 1,
  title,
  width,
  ...props
}: DuoIconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z"
        fill={secondaryFill ?? "currentColor"}
        fillOpacity="0.3"
        stroke="none"
        data-color="color-2"
      ></path>
      <path
        d="M9 16.25C10.6569 16.25 12 13.0041 12 9C12 4.99594 10.6569 1.75 9 1.75C7.34315 1.75 6 4.99594 6 9C6 13.0041 7.34315 16.25 9 16.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="M1.75 9H16.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}

// export function GlobeFillOutlineIcon({
//   fill = "currentColor",
//   secondaryfill,
//   title = "badge 13",
//   ...props
// }: IconProps) {
//   secondaryfill = secondaryfill || fill;

//   return (
//     <svg height="18" width="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" {...props}>
//       <title>{title}</title>
//       <g fill={fill}>
//         <path
//           d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z"
//           fill={secondaryfill}
//           fillOpacity="0.3"
//           stroke="none"
//         />
//         <path
//           d="M9 12C13.0041 12 16.25 10.6569 16.25 9C16.25 7.34315 13.0041 6 9 6C4.99594 6 1.75 7.34315 1.75 9C1.75 10.6569 4.99594 12 9 12Z"
//           fill="none"
//           stroke={fill}
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           strokeWidth="1"
//         />
//         <path
//           d="M9 16.25C10.6569 16.25 12 13.0041 12 9C12 4.99594 10.6569 1.75 9 1.75C7.34315 1.75 6 4.99594 6 9C6 13.0041 7.34315 16.25 9 16.25Z"
//           fill="none"
//           stroke={fill}
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           strokeWidth="1"
//         />
//         <path
//           d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z"
//           fill="none"
//           stroke={fill}
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           strokeWidth="1"
//         />
//       </g>
//     </svg>
//   );
// }
