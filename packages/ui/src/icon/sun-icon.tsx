import type { IconProps as NucleoIconProps } from "./icon-types";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

export function SunFillIcon({
  fill = "currentColor",
  secondaryfill,
  title = "badge 13",
  ...props
}: IconProps) {
  secondaryfill = secondaryfill || fill;

  return (
    <svg height="18" width="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>{title}</title>
      <g fill={fill}>
        <path
          d="M9,3c.414,0,.75-.336,.75-.75V1.25c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v1c0,.414,.336,.75,.75,.75Z"
          fill={secondaryfill}
        />
        <path
          d="M13.773,4.977c.192,0,.384-.073,.53-.22l.707-.707c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0l-.707,.707c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22Z"
          fill={secondaryfill}
        />
        <path
          d="M16.75,8.25h-1c-.414,0-.75,.336-.75,.75s.336,.75,.75,.75h1c.414,0,.75-.336,.75-.75s-.336-.75-.75-.75Z"
          fill={secondaryfill}
        />
        <path
          d="M14.303,13.243c-.293-.293-.768-.293-1.061,0s-.293,.768,0,1.061l.707,.707c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22c.293-.293,.293-.768,0-1.061l-.707-.707Z"
          fill={secondaryfill}
        />
        <path
          d="M9,15c-.414,0-.75,.336-.75,.75v1c0,.414,.336,.75,.75,.75s.75-.336,.75-.75v-1c0-.414-.336-.75-.75-.75Z"
          fill={secondaryfill}
        />
        <path
          d="M3.697,13.243l-.707,.707c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22s.384-.073,.53-.22l.707-.707c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0Z"
          fill={secondaryfill}
        />
        <path
          d="M3,9c0-.414-.336-.75-.75-.75H1.25c-.414,0-.75,.336-.75,.75s.336,.75,.75,.75h1c.414,0,.75-.336,.75-.75Z"
          fill={secondaryfill}
        />
        <path
          d="M3.697,4.757c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22c.293-.293,.293-.768,0-1.061l-.707-.707c-.293-.293-.768-.293-1.061,0s-.293,.768,0,1.061l.707,.707Z"
          fill={secondaryfill}
        />
        <circle cx="9" cy="9" fill={fill} r="5" />
      </g>
    </svg>
  );
}

export function SunOutlineIcon({
  height,
  size = "1em",
  strokeWidth = 1.5,
  title,
  width,
  ...props
}: NucleoIconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <line
        x1="9"
        y1="1.25"
        x2="9"
        y2="2.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="14.48"
        y1="3.52"
        x2="13.773"
        y2="4.227"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="16.75"
        y1="9"
        x2="15.75"
        y2="9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="14.48"
        y1="14.48"
        x2="13.773"
        y2="13.773"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="9"
        y1="16.75"
        x2="9"
        y2="15.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="3.52"
        y1="14.48"
        x2="4.227"
        y2="13.773"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="1.25"
        y1="9"
        x2="2.25"
        y2="9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <line
        x1="3.52"
        y1="3.52"
        x2="4.227"
        y2="4.227"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
      <circle
        cx="9"
        cy="9"
        r="4.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></circle>
    </svg>
  );
}
