import matplotlib.pyplot as plt
import random

# 1. Simulate data for 5 devices
devices = ['Device A', 'Device B', 'Device C', 'Device D', 'Device E']
# Generate random consumption values (e.g., in kWh or percentage)
consumption_data = [random.randint(20, 60) for _ in range(len(devices))]

# Calculate total for better visualization context if needed, but pie chart handles proportions well
total_consumption = sum(consumption_data)

# 2. Create the pie chart
plt.figure(figsize=(10, 8))
plt.pie(consumption_data, labels=devices, autopct='%1.1f%%', startangle=90, shadow=True)
plt.title('Simulated Factory Device Electricity Consumption')
plt.axis('equal') # Equal aspect ratio ensures that pie is drawn as a circle

# 3. Save the plot
output_filename = 'factory_device_consumption.png'
plt.savefig(output_filename)

print(f"Successfully generated and saved the chart to {output_filename}")