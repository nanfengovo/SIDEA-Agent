import requests


def get_data_from_csharp():
    # 假设这是您 C# 后端的一个测试接口
    # 请把这里换成您真实的 C# 接口地址，比如 http://localhost:5000/api/system/status
    csharp_api_url = "https://jsonplaceholder.typicode.com/todos/1"  # 这是一个公网测试接口

    try:
        # 发送 GET 请求
        response = requests.get(csharp_api_url, timeout=5)

        # 如果状态码是 200 (OK)
        if response.status_code == 200:
            data = response.json()  # 自动把 JSON 字符串转成 Python 字典 (类似 C# 的 Dictionary)
            print("成功从后端获取到数据：")
            print(data)
        else:
            print(f"请求失败，状态码: {response.status_code}")

    except Exception as e:
        print(f"发生错误: {e}")


if __name__ == "__main__":
    get_data_from_csharp()