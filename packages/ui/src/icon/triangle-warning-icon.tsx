import type { IconProps } from "./icon-types";

export function TriangleWarningOutlineIcon({
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
        d="m9,8c0-.552.447-1,1-1s1,.448,1,1v4.5c0,.552-.447,1-1,1s-1-.448-1-1v-4.5Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <circle cx="10" cy="15.75" r="1.25" fill="currentColor" data-color="color-2"></circle>
      <path
        d="m13.725,16h1.471c1.54,0,2.502-1.667,1.732-3l-5.196-9c-.77-1.333-2.694-1.333-3.464,0L3.072,13c-.77,1.333.192,3,1.732,3h1.471"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}
export function TriangleWarningFillIcon({
  height,
  size = "1em",
  title,
  width,
  ...props
}: IconProps) {
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
        d="M16.4364 12.5151L11.0101 3.11316C10.5902 2.39096 9.83872 1.96045 8.99982 1.96045C8.16092 1.96045 7.40952 2.39106 6.98952 3.11316C6.98902 3.11366 6.98902 3.11473 6.98852 3.11523L1.56272 12.5156C1.14332 13.2436 1.14332 14.1128 1.56372 14.8398C1.98362 15.5664 2.73562 16 3.57492 16H14.4245C15.2639 16 16.0158 15.5664 16.4357 14.8398C16.8561 14.1127 16.8563 13.2436 16.4364 12.5151ZM8.24992 6.75C8.24992 6.3359 8.58582 6 8.99992 6C9.41402 6 9.74992 6.3359 9.74992 6.75V9.75C9.74992 10.1641 9.41402 10.5 8.99992 10.5C8.58582 10.5 8.24992 10.1641 8.24992 9.75V6.75ZM8.99992 13.5C8.44792 13.5 7.99992 13.0498 7.99992 12.5C7.99992 11.9502 8.44792 11.5 8.99992 11.5C9.55192 11.5 9.99992 11.9502 9.99992 12.5C9.99992 13.0498 9.55192 13.5 8.99992 13.5Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
