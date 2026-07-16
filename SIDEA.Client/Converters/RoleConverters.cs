using System;
using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Layout;
using Avalonia.Media;

namespace SIDEA.Client.Converters;

public class RoleToBackgroundConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string role)
        {
            if (role.Equals("User", StringComparison.OrdinalIgnoreCase))
                return new SolidColorBrush(Color.Parse("#00f2fe")) { Opacity = 0.2 };
            else
                return new SolidColorBrush(Color.Parse("#1e1e2d"));
        }
        return new SolidColorBrush(Colors.Transparent);
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => throw new NotImplementedException();
}

public class RoleToAlignmentConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string role)
        {
            if (role.Equals("User", StringComparison.OrdinalIgnoreCase))
                return HorizontalAlignment.Right;
            else
                return HorizontalAlignment.Left;
        }
        return HorizontalAlignment.Left;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => throw new NotImplementedException();
}
