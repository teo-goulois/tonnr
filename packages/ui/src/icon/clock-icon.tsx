import type { IconProps } from "./icon-types";

export function ClockOutlineIcon({
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
      <polyline
        points="10 6.5 10 10 12.5 12.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></polyline>
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
export function ClockFillIcon({ height, size = "1em", title, width, ...props }: IconProps) {
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
        d="M9,1C4.589,1,1,4.589,1,9s3.589,8,8,8,8-3.589,8-8S13.411,1,9,1Zm3.867,10.677c-.146,.21-.379,.323-.617,.323-.147,0-.296-.043-.426-.133l-3.25-2.25c-.203-.14-.323-.371-.323-.617V4.75c0-.414,.336-.75,.75-.75s.75,.336,.75,.75v3.857l2.927,2.026c.341,.236,.426,.703,.19,1.043Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
