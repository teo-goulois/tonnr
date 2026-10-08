import type { IconProps } from "./icon-types";

export function CommandOutlineIcon({
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
      <rect
        x="7"
        y="7"
        width="6"
        height="6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></rect>
      <path
        d="m5,3c-1.1046,0-2,.8954-2,2s.8954,2,2,2h2v-2c0-1.1046-.8954-2-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m15,3c1.1046,0,2,.8954,2,2,0,1.1046-.8954,2-2,2h-2v-2c0-1.1046.8954-2,2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m5,17c-1.1046,0-2-.8954-2-2s.8954-2,2-2h2v2c0,1.1046-.8954,2-2,2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m15,17c1.1046,0,2-.8954,2-2,0-1.1046-.8954-2-2-2h-2v2c0,1.1046.8954,2,2,2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}
