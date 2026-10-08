import type { IconProps } from "./icon-types";

export function MsgOutlineIcon({
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
        d="m10,3c-3.866,0-7,3.134-7,7,0,1.376.403,2.655,1.088,3.737l-1.088,3.263,3.263-1.088c1.082.685,2.361,1.088,3.737,1.088,3.866,0,7-3.134,7-7s-3.134-7-7-7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}
