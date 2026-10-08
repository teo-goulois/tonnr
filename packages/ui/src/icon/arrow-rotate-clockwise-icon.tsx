import type { IconProps } from "./icon-types";

export function ArrowRotateClockwiseOutlineIcon({
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
      <path
        d="m15,5.101c-1.271-1.297-3.041-2.101-5-2.101-3.866,0-7,3.134-7,7,0,3.866,3.134,7,7,7,2.792,0,5.203-1.635,6.326-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></path>
      <polygon
        points="15.633 3.044 16.229 6.798 12.484 6.145 15.633 3.044"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        fill="currentColor"
      ></polygon>
    </svg>
  );
}
