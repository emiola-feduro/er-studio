import type { ReactNode } from 'react';

type InspectorSectionProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

const InspectorSection = ({ title, action, children }: InspectorSectionProps) => {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
};

export default InspectorSection;
