"use client";

import { Star } from "lucide-react";

interface MCPRatingStarsProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
}

export function MCPRatingStars({
  rating,
  size = "sm",
  showNumber = true,
}: MCPRatingStarsProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  // Renderizar estrelas cheias
  for (let i = 0; i < fullStars; i++) {
    stars.push(
      <Star
        key={i}
        className={`${sizeClasses[size]} fill-yellow-400 text-yellow-400`}
      />
    );
  }

  // Renderizar meia estrela se necessário
  if (hasHalfStar) {
    stars.push(
      <div key="half" className="relative">
        <Star className={`${sizeClasses[size]} text-gray-300`} />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: "50%" }}
        >
          <Star
            className={`${sizeClasses[size]} fill-yellow-400 text-yellow-400`}
          />
        </div>
      </div>
    );
  }

  // Renderizar estrelas vazias
  const emptyStars = 5 - Math.ceil(rating);
  for (let i = 0; i < emptyStars; i++) {
    stars.push(
      <Star
        key={`empty-${i}`}
        className={`${sizeClasses[size]} text-gray-300`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex">{stars}</div>
      {showNumber && (
        <span className="text-sm text-[var(--muted-foreground)] ml-1">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
