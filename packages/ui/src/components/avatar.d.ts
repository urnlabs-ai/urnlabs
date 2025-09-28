import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { type VariantProps } from "class-variance-authority";
declare const avatarVariants: (props?: ({
    size?: "default" | "sm" | "lg" | "xl" | "2xl" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Avatar: React.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarProps & React.RefAttributes<HTMLSpanElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "sm" | "lg" | "xl" | "2xl" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & React.RefAttributes<HTMLSpanElement>>;
declare const AvatarImage: React.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarImageProps & React.RefAttributes<HTMLImageElement>, "ref"> & React.RefAttributes<HTMLImageElement>>;
declare const AvatarFallback: React.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarFallbackProps & React.RefAttributes<HTMLSpanElement>, "ref"> & React.RefAttributes<HTMLSpanElement>>;
export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    max?: number;
    size?: VariantProps<typeof avatarVariants>["size"];
    spacing?: "tight" | "normal" | "loose";
}
declare const AvatarGroup: React.ForwardRefExoticComponent<AvatarGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface UserAvatarProps extends React.ComponentPropsWithoutRef<typeof Avatar> {
    src?: string;
    name?: string;
    status?: "online" | "offline" | "away" | "busy";
    showStatus?: boolean;
}
declare const UserAvatar: React.ForwardRefExoticComponent<UserAvatarProps & React.RefAttributes<HTMLSpanElement>>;
export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, UserAvatar, avatarVariants };
//# sourceMappingURL=avatar.d.ts.map