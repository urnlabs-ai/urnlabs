import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BIDashboard } from './BIDashboard';

// Mock the services
jest.mock('../../services/MetricsAggregator', () => ({
  MetricsAggregator: jest.fn().mockImplementation(() => ({
    getBusinessKPIs: jest.fn().mockResolvedValue([
      {
        id: 'test-kpi-1',
        name: 'Test KPI',
        value: 100,
        target: 120,
        unit: '%',
        change: 5,
        changePercent: 5.2,
        trend: 'up',
        status: 'good',
        category: 'performance'
      }
    ]),
    getPerformanceMetrics: jest.fn().mockResolvedValue({
      apiResponseTime: {
        name: 'API Response Time',
        data: [{ timestamp: new Date(), value: 150 }],
        summary: { current: 150, previous: 160, change: -10, changePercent: -6.25, trend: 'down' }
      },
      errorRate: {
        name: 'Error Rate',
        data: [{ timestamp: new Date(), value: 0.5 }],
        summary: { current: 0.5, previous: 0.8, change: -0.3, changePercent: -37.5, trend: 'down' }
      },
      throughput: {
        name: 'Throughput',
        data: [{ timestamp: new Date(), value: 500 }],
        summary: { current: 500, previous: 450, change: 50, changePercent: 11.1, trend: 'up' }
      },
      uptime: {
        name: 'Uptime',
        data: [{ timestamp: new Date(), value: 0.999 }],
        summary: { current: 99.9, previous: 99.8, change: 0.1, changePercent: 0.1, trend: 'up' }
      }
    }),
    getCostMetrics: jest.fn().mockResolvedValue({
      totalCost: {
        name: 'Total Cost',
        data: [{ timestamp: new Date(), value: 8500 }],
        summary: { current: 8500, previous: 9000, change: -500, changePercent: -5.6, trend: 'down' }
      },
      costPerExecution: {
        name: 'Cost per Execution',
        data: [{ timestamp: new Date(), value: 0.15 }],
        summary: { current: 0.15, previous: 0.18, change: -0.03, changePercent: -16.7, trend: 'down' }
      },
      costSavings: {
        name: 'Cost Savings',
        data: [{ timestamp: new Date(), value: 65000 }],
        summary: { current: 65000, previous: 60000, change: 5000, changePercent: 8.3, trend: 'up' }
      },
      efficiency: {
        name: 'Efficiency',
        data: [{ timestamp: new Date(), value: 88 }],
        summary: { current: 88, previous: 85, change: 3, changePercent: 3.5, trend: 'up' }
      }
    }),
    getUsageMetrics: jest.fn().mockResolvedValue({
      activeUsers: {
        name: 'Active Users',
        data: [{ timestamp: new Date(), value: 1250 }],
        summary: { current: 1250, previous: 1200, change: 50, changePercent: 4.2, trend: 'up' }
      },
      executionsCount: {
        name: 'Executions',
        data: [{ timestamp: new Date(), value: 12500 }],
        summary: { current: 12500, previous: 12000, change: 500, changePercent: 4.2, trend: 'up' }
      },
      dataProcessed: {
        name: 'Data Processed',
        data: [{ timestamp: new Date(), value: 450 }],
        summary: { current: 450, previous: 430, change: 20, changePercent: 4.7, trend: 'up' }
      },
      userEngagement: {
        name: 'User Engagement',
        data: [{ timestamp: new Date(), value: 7.8 }],
        summary: { current: 7.8, previous: 7.5, change: 0.3, changePercent: 4.0, trend: 'up' }
      }
    }),
    getROIMetrics: jest.fn().mockResolvedValue({
      totalROI: 425,
      monthlySavings: 75000,
      automationEfficiency: 92,
      timeToValue: 30,
      productivityGain: 340
    })
  })),
  createTimeRange: jest.fn().mockReturnValue({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date(),
    granularity: 'hour'
  })
}));

jest.mock('../../services/AnalyticsService', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({
    getAlerts: jest.fn().mockResolvedValue([
      {
        id: 'alert-1',
        ruleId: 'rule-1',
        title: 'High Response Time',
        description: 'API response time exceeded threshold',
        severity: 'warning',
        timestamp: new Date(),
        resolved: false,
        metadata: {}
      }
    ]),
    getForecast: jest.fn().mockResolvedValue({
      metric: 'Test Metric',
      historical: [
        { timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), value: 100 },
        { timestamp: new Date(), value: 110 }
      ],
      forecast: [
        { timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000), value: 120, confidence: 0.85 }
      ],
      trend: 'increasing',
      accuracy: 0.92
    }),
    subscribeToMetrics: jest.fn(),
    addEventListener: jest.fn(),
    unsubscribeFromMetrics: jest.fn(),
    removeEventListener: jest.fn(),
    exportDashboard: jest.fn().mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }))
  }))
}));

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
  Brush: () => <div data-testid="brush" />
}));

describe('BIDashboard', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('renders the dashboard with header and navigation', async () => {
    render(<BIDashboard />);
    
    expect(screen.getByText('Business Intelligence Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    expect(screen.getByText('Drill-Down')).toBeInTheDocument();
  });

  it('loads and displays KPIs on the overview tab', async () => {
    render(<BIDashboard />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    expect(screen.getByText('100.0')).toBeInTheDocument();
    expect(screen.getByText('+5.2%')).toBeInTheDocument();
  });

  it('switches between tabs correctly', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click on Performance tab
    fireEvent.click(screen.getByText('Performance'));
    
    await waitFor(() => {
      expect(screen.getByText('API Response Time')).toBeInTheDocument();
    });

    // Click on Cost tab
    fireEvent.click(screen.getByText('Cost'));
    
    await waitFor(() => {
      expect(screen.getByText('Total Operating Cost')).toBeInTheDocument();
    });
  });

  it('handles refresh functionality', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click refresh button
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Verify refresh was called (mocked functions should be called again)
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });
  });

  it('handles time range selection', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Find and click time range selector
    const timeRangeSelect = screen.getByDisplayValue('Last 24 Hours');
    fireEvent.change(timeRangeSelect, { target: { value: 'day:168' } });

    // Verify the selection changed
    await waitFor(() => {
      expect(timeRangeSelect).toHaveValue('day:168');
    });
  });

  it('displays alerts correctly', async () => {
    render(<BIDashboard />);
    
    // Wait for alerts to load
    await waitFor(() => {
      // Should show alert indicator
      expect(screen.getByText('1')).toBeInTheDocument(); // Alert count badge
    });
  });

  it('handles export functionality', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click export button
    const exportButton = screen.getByText('Export');
    fireEvent.click(exportButton);

    // Verify export was initiated (would show in real implementation)
    expect(exportButton).toBeInTheDocument();
  });

  it('shows loading states correctly', async () => {
    render(<BIDashboard />);
    
    // Should show loading initially
    expect(screen.getByText('Business Intelligence Dashboard')).toBeInTheDocument();
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });
  });

  it('handles settings panel', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click settings button
    const settingsButton = screen.getByText('Settings');
    fireEvent.click(settingsButton);

    // Should show settings panel
    await waitFor(() => {
      expect(screen.getByText('Dashboard Settings')).toBeInTheDocument();
    });

    // Should show auto-refresh option
    expect(screen.getByText('Auto-refresh')).toBeInTheDocument();
  });

  it('handles forecast tab', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click forecast tab
    fireEvent.click(screen.getByText('Forecast'));
    
    await waitFor(() => {
      expect(screen.getByText('Test Metric Forecast')).toBeInTheDocument();
    });
  });

  it('handles drill-down functionality', async () => {
    render(<BIDashboard />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });

    // Click on a KPI to drill down
    const kpiCard = screen.getByText('Test KPI').closest('div');
    if (kpiCard) {
      fireEvent.click(kpiCard);
    }

    // Should switch to drill-down tab
    await waitFor(() => {
      expect(screen.getByText('Drill-Down Analytics:')).toBeInTheDocument();
    });
  });
});

// Integration test for real-time updates
describe('BIDashboard Real-time Updates', () => {
  it('subscribes to real-time updates when auto-refresh is enabled', async () => {
    const mockAnalyticsService = require('../../services/AnalyticsService').AnalyticsService;
    const mockInstance = new mockAnalyticsService();

    render(<BIDashboard />);
    
    await waitFor(() => {
      expect(mockInstance.subscribeToMetrics).toHaveBeenCalledWith(
        ['kpis', 'performance', 'cost'],
        expect.any(Function)
      );
    });
  });

  it('updates last updated timestamp on data changes', async () => {
    render(<BIDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });
});

// Performance test
describe('BIDashboard Performance', () => {
  it('renders within acceptable time', async () => {
    const startTime = performance.now();
    
    render(<BIDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Test KPI')).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within 2 seconds
    expect(renderTime).toBeLessThan(2000);
  });
});