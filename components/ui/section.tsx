import { cn } from "@/lib/utils";

type Padding = "sm" | "md" | "lg";

interface SectionProps extends React.ComponentProps<"section"> {
  padding?: Padding;
  fullWidth?: boolean;
}

function paddingToClass(padding?: Padding) {
  switch (padding) {
    case "sm": return "px-4 md:px-6 lg:px-8 py-4 md:py-6";
    case "lg": return "px-4 md:px-6 lg:px-8 py-8 md:py-12";
    case "md":
    default:
      return "px-4 md:px-6 lg:px-8 py-6 md:py-8";
  }
}

export function Section({ padding = "md", fullWidth = false, className, children, ...props }: SectionProps) {
  return (
    <section
      className={cn(paddingToClass(padding), fullWidth ? "w-full" : "w-full max-w-6xl mx-auto", className)}
      {...props}
    >
      {children}
    </section>
  );
}