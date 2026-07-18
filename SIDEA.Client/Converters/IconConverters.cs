using System;
using System.Globalization;
using Avalonia;
using Avalonia.Data.Converters;
using Avalonia.Media;

namespace SIDEA.Client.Converters;

public class IconTypeToGeometryConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string type)
        {
            if (Application.Current != null && Application.Current.TryGetResource($"{type}Icon", Avalonia.Styling.ThemeVariant.Default, out var appRes) && appRes != null)
                return appRes;
        }
        return null;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
