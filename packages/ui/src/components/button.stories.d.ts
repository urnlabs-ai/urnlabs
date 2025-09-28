import type { StoryObj } from '@storybook/react';
declare const meta: {
    title: string;
    component: import("react").ForwardRefExoticComponent<import("./button").ButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
    parameters: {
        layout: string;
        docs: {
            description: {
                component: string;
            };
        };
    };
    tags: string[];
    argTypes: {
        variant: {
            control: "select";
            options: string[];
        };
        size: {
            control: "select";
            options: string[];
        };
        animation: {
            control: "select";
            options: string[];
        };
        loading: {
            control: "boolean";
        };
        disabled: {
            control: "boolean";
        };
        fullWidth: {
            control: "boolean";
        };
    };
    args: {
        onClick: any;
    };
};
export default meta;
type Story = StoryObj<typeof meta>;
export declare const Default: Story;
export declare const Variants: Story;
export declare const Sizes: Story;
export declare const WithIcons: Story;
export declare const States: Story;
export declare const Animations: Story;
export declare const FullWidth: Story;
//# sourceMappingURL=button.stories.d.ts.map