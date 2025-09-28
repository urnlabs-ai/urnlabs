import type { Meta, StoryObj } from '@storybook/react'
import { action } from '@storybook/addon-actions'
import { Download, ArrowRight, Star } from 'lucide-react'

import { Button } from './button'

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A versatile button component with multiple variants, sizes, and animations.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'gradient'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'xl', 'icon'],
    },
    animation: {
      control: 'select',
      options: ['none', 'hover', 'bounce'],
    },
    loading: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
    fullWidth: {
      control: 'boolean',
    },
  },
  args: {
    onClick: action('clicked'),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="gradient">Gradient</Button>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button icon={<Download className="h-4 w-4" />} iconPosition="left">
        Download
      </Button>
      <Button icon={<ArrowRight className="h-4 w-4" />} iconPosition="right">
        Continue
      </Button>
      <Button size="icon" variant="outline">
        <Star className="h-4 w-4" />
      </Button>
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>Normal</Button>
      <Button loading>Loading</Button>
      <Button disabled>Disabled</Button>
      <Button loading disabled>
        Loading Disabled
      </Button>
    </div>
  ),
}

export const Animations: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button animation="none">No Animation</Button>
      <Button animation="hover">Hover Scale</Button>
      <Button animation="bounce">Bounce</Button>
    </div>
  ),
}

export const FullWidth: Story = {
  render: () => (
    <div className="w-96">
      <Button fullWidth>Full Width Button</Button>
    </div>
  ),
}