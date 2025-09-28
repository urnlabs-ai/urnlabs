import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@urnlabs/ui';

interface FaqProps {
  className?: string;
}

const Faq: React.FC<FaqProps> = ({ className }) => {
  const faqData = [
    {
      question: "What is Urnlabs?",
      answer: "Urnlabs is a production-ready AI agent platform focused on building deterministic workflows with enterprise-grade governance. We transform operations through measurable automation that delivers predictable outcomes and auditable processes."
    },
    {
      question: "How is Urnlabs different from other AI platforms?",
      answer: "We focus on three core principles: deterministic flows for predictable outcomes, governance-first architecture for enterprise security, and measured ROI with complete task tracking. This means you get reliable, secure, and profitable AI automation."
    },
    {
      question: "What kind of workflows can I build?",
      answer: "Build everything from customer onboarding and data processing pipelines to complex multi-agent coordination systems. Our platform supports API integrations, conditional logic, human-in-the-loop approvals, and enterprise-grade security controls."
    },
    {
      question: "How do you ensure governance and compliance?",
      answer: "Built-in audit trails, role-based access controls, data privacy safeguards, and compliance frameworks (SOC 2, GDPR, HIPAA). Every action is logged, every decision is traceable, and every process follows your governance policies."
    },
    {
      question: "What's your pricing model?",
      answer: "We offer usage-based pricing that scales with your automation needs. Start with our free tier for development, then pay for successful task completions. Enterprise plans include dedicated support, custom integrations, and advanced security features."
    },
    {
      question: "Do you offer a free trial?",
      answer: "Yes! Start with a 14-day free trial that includes full platform access, sample workflows, and dedicated onboarding support. No credit card required to get started."
    },
    {
      question: "How do you measure ROI?",
      answer: "Track every metric that matters: task completion rates, time savings, cost reduction, error prevention, and productivity gains. Our analytics dashboard provides real-time insights into your automation performance and business impact."
    },
    {
      question: "What kind of support do you provide?",
      answer: "Comprehensive support including technical documentation, video tutorials, community forums, and direct access to our engineering team. Enterprise customers get dedicated success managers and priority support."
    }
  ];

  return (
    <div className={`w-full max-w-4xl mx-auto ${className || ''}`}>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-white mb-4">Frequently Asked Questions</h2>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto">
          Everything you need to know about our AI agent platform
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-4">
        {faqData.map((item, index) => (
          <AccordionItem
            key={`item-${index + 1}`}
            value={`item-${index + 1}`}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-6"
          >
            <AccordionTrigger className="text-white hover:text-blue-400 text-left">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-slate-300 leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-12 text-center">
        <p className="text-slate-400 mb-4">
          Still have questions? We're here to help.
        </p>
        <a
          href="/contact"
          className="inline-flex items-center text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          Contact our team →
        </a>
      </div>
    </div>
  );
};

export default Faq;