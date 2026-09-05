---
title: "Understanding the very first few lines of basic C++ code"
date: "2017-08-20"
description: "What #include <iostream>, using namespace std, and namespaces really mean, explained through a small C++ scope-resolution example."
categories: ["Programming", "C++"]
tags: ["C++", "Code", "Basics", "Tutorial", "Understanding"]
draft: false
---

![](http://i.imgur.com/NrUx8p9.jpg)

Most Computer Science undergrads have written some C++ at some point in their lives.

Let me begin with a small code snippet.

```
#include<iostream>

using namespace std;

namespace abc {
int a = 100;
}

int a = 200;

int main() {
	int a = 300;

	cout << "abc::a = " << abc::a << endl;
	cout << "::a = " <<::a << endl;
	cout << "a = " << a << endl;
	return (0);
}
```

Running the code produces this output:

```
abc::a = 100
::a = 200
a = 300
```

If you look at the code you will see we always start with something like `#include<iostream>`, then add some more `#include<...>` (if needed). We usually call them header files. But if you have ever written code in C then you might be curious why we use a header file without `.h` at the end in C++ (and why not with `.h` like we used to do while writing code in C). The reason behind it is rather simple, though the full story has many layers. The simple answer to this question is that `iostream` is a part of the C++ standard headers while `iostream.h` is not. `iostream.h` is rejected by modern C++ compilers. To be more precise there is no mention of `iostream.h` at all in the current C++ standard ([ISO/IEC DIS 14882](https://www.iso.org/standard/68564.html)).

Again we can use headers like `stdio.h` in C++ without any problem. But that is not the convention. C++ is derived from C and hence we are permitted to use the headers we previously used in C. But in a C++ application you shouldn’t use `stdio.h`; instead you should use `cstdio`. You can use most of the C headers in C++ but all you need to do is remove the `.h` part and add `c` before the header name. Example:

```
#include<cstdio>
#include<cstddef>
#include<cstring>
#include<cwchar>
```

Now coming to the next part, i.e. `using namespace std`. Why do we use it?

Try omitting `using namespace std` and run the code.

```
#include<iostream>

//using namespace std;

namespace abc {
int a = 100;
}

int a = 200;

int main() {
	int a = 300;

	cout << "abc::a = " << abc::a << endl;
	cout << "::a = " <<::a << endl;
	cout << "a = " << a << endl;
	return (0);
}
```

You will get an error which looks something like this:

`error: 'cout' was not declared in this scope`

When you use a C++ library header without `.h`, such as `#include<iostream>`, then it loads all the symbols in the `iostream` header file inside the `std` namespace (We will discuss namespaces in the next part).

NOTE: The std (abbreviation for standard) namespace is empty by default. Header symbols are loaded into the `std` namespace when they are included without `.h`.

If you omit `using namespace std` then, you will not be able to use names such as `cout` or `cin` or even `endl`. What actually is a namespace? Although this cannot be answered in a single blog post as namespace is a very advanced topic in C++. Simply put, a `namespace` is nothing but a container. It contains a set of symbols. When you use `using namespace std` it actually invokes this:

```
namespace std
{
#include <iostream.h>
};
```

```
#include<iostream>

//using namespace std;

namespace abc {
int a = 100;
}

int a = 200;

int main() {
	int a = 300;

	std::cout << "abc::a = " << abc::a << std::endl;
	std::cout << "::a = " <<::a << std::endl;
	std::cout << "a = " << a << std::endl;
	return (0);
}
```

So what does `using namespace std` do so that we can use `cout` without `std::`? Basically, it loads all the symbols in the C++ Standard Library and makes them `global` (To understand this you need to have a good knowledge of scope, or just carry along with this blog. I will try to make it clearer).

So now let’s talk about what we learned at the beginning: `using namespace std` loads all the standard library symbols as well as makes them global. So we can use `cout` in place of `std::cout` as `cout` is now global and we haven’t redefined it inside the main function (So only `cout` will work. No need for `::cout`. Though that will work too). This is how it all works.

I hope you like reading this blog. If you have any questions then feel free to comment below. Also if you like it, you can share it with your friends.
