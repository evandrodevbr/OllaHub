import { cn } from "@/lib/utils";

type Gap = 8 | 16 | 24 | 32 | 40 | 48;
type Direction = "vertical" | "horizontal";
type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";

interface StackProps extends React.ComponentProps<"div"> {
  direction?: Direction;
  gap?: Gap;
  align?: Align;
  justify?: Justify;
}

function gapToClass(gap?: Gap) {
  switch (gap) {
    case 8: return "gap-2";
    case 16: return "gap-4";
    case 24: return "gap-6";
    case 32: return "gap-8";
    case 40: return "gap-10";
    case 48: return "gap-12";
    default: return "gap-4";
  }
}

function alignToClass(align?: Align) {
  switch (align) {
    case "start": return "items-start";
    case "center": return "items-center";
    case "end": return "items-end";
    case "stretch": return "items-stretch";
    default: return "items-start";
  }
}

function justifyToClass(justify?: Justify) {
  switch (justify) {
    case "start": return "justify-start";
    case "center": return "justify-center";
    case "end": return "justify-end";
    case "between": return "justify-between";
    default: return "justify-start";
  }
}

export function Stack({
  direction = "vertical",
  gap = 16,
  align = "start",
  justify = "start",
  className,
  children,
  ...props
}: StackProps) {
  const dirClass = direction === "vertical" ? "flex flex-col" : "flex";
  return (
    <div
      className={cn(dirClass, gapToClass(gap), alignToClass(align), justifyToClass(justify), className)}
      {...props}
    >
      {children}
    </div>
  );
}