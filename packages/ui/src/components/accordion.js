"use client";
import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, Plus } from "lucide-react";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
const accordionVariants = cva("w-full", {
    variants: {
        variant: {
            default: "",
            bordered: "border border-border rounded-lg overflow-hidden",
            separated: "space-y-2",
            ghost: "",
        },
        size: {
            sm: "[&_[data-accordion-content]]:px-3 [&_[data-accordion-content]]:py-2",
            default: "[&_[data-accordion-content]]:px-4 [&_[data-accordion-content]]:py-3",
            lg: "[&_[data-accordion-content]]:px-6 [&_[data-accordion-content]]:py-4",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
const Accordion = React.forwardRef(({ className, variant, size, ...props }, ref) => (<AccordionPrimitive.Root ref={ref} className={cn(accordionVariants({ variant, size }), className)} {...props}/>));
Accordion.displayName = "Accordion";
const AccordionItem = React.forwardRef(({ className, variant = "default", ...props }, ref) => (<AccordionPrimitive.Item ref={ref} className={cn("border-b border-border", variant === "bordered" && "border-b border-border last:border-b-0", variant === "separated" && "border border-border rounded-lg", variant === "ghost" && "border-b-0", className)} {...props}/>));
AccordionItem.displayName = "AccordionItem";
const AccordionTrigger = React.forwardRef(({ className, children, icon = "chevron", iconPosition = "right", animated = true, ...props }, ref) => {
    const getIcon = () => {
        switch (icon) {
            case "plus":
                return (<motion.div animate={{ rotate: 0 }} className="[&[data-state=open]>svg]:rotate-45">
            <Plus className="h-4 w-4 transition-transform duration-200"/>
          </motion.div>);
            case "chevron":
                return (<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180"/>);
            case "none":
                return null;
            default:
                return <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200"/>;
        }
    };
    return (<AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger ref={ref} className={cn("flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180", iconPosition === "left" && "flex-row-reverse", className)} {...props}>
        {children}
        {getIcon()}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>);
});
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;
const AccordionContent = React.forwardRef(({ className, children, animated = true, ...props }, ref) => {
    if (animated) {
        return (<AccordionPrimitive.Content ref={ref} className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className={cn("pb-4 pt-0", className)} data-accordion-content>
          {children}
        </motion.div>
      </AccordionPrimitive.Content>);
    }
    return (<AccordionPrimitive.Content ref={ref} className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}>
      <div className={cn("pb-4 pt-0", className)} data-accordion-content>
        {children}
      </div>
    </AccordionPrimitive.Content>);
});
AccordionContent.displayName = AccordionPrimitive.Content.displayName;
const EnhancedAccordion = React.forwardRef(({ items, icon = "chevron", iconPosition = "right", animated = true, className, ...props }, ref) => {
    return (<Accordion ref={ref} className={className} {...props}>
      {items.map((item) => (<AccordionItem key={item.value} value={item.value} disabled={item.disabled}>
          <AccordionTrigger icon={icon} iconPosition={iconPosition} animated={animated} className="flex items-center gap-2">
            {item.icon && <span>{item.icon}</span>}
            {item.trigger}
          </AccordionTrigger>
          <AccordionContent animated={animated}>
            {item.content}
          </AccordionContent>
        </AccordionItem>))}
    </Accordion>);
});
EnhancedAccordion.displayName = "EnhancedAccordion";
const FAQAccordion = React.forwardRef(({ faqs, showCategories = false, searchable = false, className, ...props }, ref) => {
    const [searchTerm, setSearchTerm] = React.useState("");
    const filteredFAQs = React.useMemo(() => {
        if (!searchTerm)
            return faqs;
        return faqs.filter((faq) => faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (typeof faq.answer === "string" &&
                faq.answer.toLowerCase().includes(searchTerm.toLowerCase())));
    }, [faqs, searchTerm]);
    const groupedFAQs = React.useMemo(() => {
        if (!showCategories)
            return { "": filteredFAQs };
        return filteredFAQs.reduce((acc, faq) => {
            const category = faq.category || "General";
            if (!acc[category])
                acc[category] = [];
            acc[category].push(faq);
            return acc;
        }, {});
    }, [filteredFAQs, showCategories]);
    const items = Object.entries(groupedFAQs).flatMap(([category, categoryFAQs]) => categoryFAQs.map((faq, index) => ({
        value: `${category}-${index}`,
        trigger: (<div className="text-left">
            {showCategories && category && (<div className="text-xs text-muted-foreground mb-1">
                {category}
              </div>)}
            <div className="font-medium">{faq.question}</div>
          </div>),
        content: (<div className="prose prose-sm max-w-none dark:prose-invert">
            {faq.answer}
          </div>),
    })));
    return (<div className="space-y-4">
      {searchable && (<div className="relative">
          <input type="text" placeholder="Search FAQs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"/>
        </div>)}
      <EnhancedAccordion ref={ref} items={items} className={className} {...props}/>
      {filteredFAQs.length === 0 && searchTerm && (<div className="text-center py-8 text-muted-foreground">
          No FAQs found matching "{searchTerm}"
        </div>)}
    </div>);
});
FAQAccordion.displayName = "FAQAccordion";
const NestedAccordion = React.forwardRef(({ items, maxDepth = 3, className, ...props }, ref) => {
    const renderNestedItems = (nestedItems, depth = 0) => {
        return nestedItems.map((item) => ({
            ...item,
            content: (<div>
          {item.content}
          {item.children && depth < maxDepth && (<div className="mt-4 pl-4 border-l border-border">
              <EnhancedAccordion type="multiple" items={renderNestedItems(item.children, depth + 1)} variant="ghost" {...props}/>
            </div>)}
        </div>),
        }));
    };
    return (<EnhancedAccordion ref={ref} items={renderNestedItems(items)} className={className} {...props}/>);
});
NestedAccordion.displayName = "NestedAccordion";
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, EnhancedAccordion, FAQAccordion, NestedAccordion, accordionVariants, };
//# sourceMappingURL=accordion.js.map