// features/visibility/components/VisibilityToggleButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

import { VisibilityToggleButton } from './VisibilityToggleButton';

describe('VisibilityToggleButton', () => {
  it('renders "Visible" text when isHidden=false', async () => {
    const mockOnPress = jest.fn();
    await render(<VisibilityToggleButton isHidden={false} onPress={mockOnPress} />);

    expect(screen.getByText('Visible')).toBeTruthy();
  });

  it('renders "Hidden" text when isHidden=true', async () => {
    const mockOnPress = jest.fn();
    await render(<VisibilityToggleButton isHidden={true} onPress={mockOnPress} />);

    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it('calls onPress when pressed', async () => {
    const mockOnPress = jest.fn();
    await render(<VisibilityToggleButton isHidden={false} onPress={mockOnPress} />);

    const button = screen.getByText('Visible').parent;
    fireEvent.press(button!);

    expect(mockOnPress).toHaveBeenCalled();
  });

  it('has correct accessibility label when visible', async () => {
    const mockOnPress = jest.fn();
    await render(<VisibilityToggleButton isHidden={false} onPress={mockOnPress} />);

    const button = screen.getByLabelText('Visible to this group');
    expect(button).toBeTruthy();
  });

  it('has correct accessibility label when hidden', async () => {
    const mockOnPress = jest.fn();
    await render(<VisibilityToggleButton isHidden={true} onPress={mockOnPress} />);

    const button = screen.getByLabelText('Hidden from this group');
    expect(button).toBeTruthy();
  });
});
