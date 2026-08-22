---
title: "Understanding the very first few lines of basic C++ code"
date: "2017-08-20"
description: "So most of the students in Computer Science Department of a B.Tech college have written code in C++ at some point in their life. Let me begin with a small code snippet. #include<iostream> using namespace std; namespace abc { int a = 100; } int a = 200; int main() { int a = 300; cout << \"abc::a = \" << abc::a << endl; cout << \"::a = \" <<::a << endl; cout << \"a = \" << a << endl; return (0); } Running the code produce this output:"
categories: ["Programming", "C++"]
tags: ["C++", "Code", "Basics", "Tutorial", "Understanding"]
draft: false
---

![](http://i.imgur.com/NrUx8p9.jpg)

So most of the students in Computer Science Department of a B.Tech college have written code in C++ at some point in their life.

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

Running the code produce this output:

```
abc::a = 100
::a = 200
a = 300
```

If you look at the code you will see we always start with something like `#include<iostream>`, then add some more `#include<...>` (if needed). We usually call them header file. But if you have ever written code in C language then you might be curious why do we use a header file without `.h` at the end in C++ (and why not with `.h` like we used to do while writing code in C). The reason behind is rather simple but it has too many chain elements. The simple answer to this question is `iostream` is a part of C++ standard header while `iostream.h` is not. `iostream.h` is disapproved by some latest C++ compiler. To be more precise there is no mention of `iostream.h` at all in the current C++ standard ([ISO/IEC DIS 14882](https://www.iso.org/standard/68564.html)).

Again we can use headers like `stdio.h` in C++ without any problem. But that is not the convention. C++ is derived from C and hence we permitted to use the header we previously used in C. But in C++ application you shouldn’t use `stdio.h`, but you should use instead `cstdio`. You can use most of the C header in C++ but all you need to do is remove the `.h` part and add `c` before the header name. example:

```
#include<cstdio>
#include<cstddef>
#include<cstring>
#include<cwchar>
```

Now coming to next part i.e. `using namespace std`. Why do we use it?

Try omitting using namespace std and run the code.

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

When you use a C++ library without `.h`, such as `#include<iostream>` then it load all the symbols in `iostream` header file inside `std` namespace (We will discuss namespace in next part).

NOTE: The std (abbrevate for standard) namespace is empty by default. Header symbols a loaded in `std` namespace when they are include without `.h`.

If you omit `using namespace std` then, you will not be able to use the reference such as `cout` or `cin` or even `endl`. What is actually a namespace? Although this cannot be answered in a single blog post as namespace is a very advanced topic in C++. Though to be logical here, `namespace` is nothing but a container. It contains a set of symbols. When you use `using namespace std` it actually invokes this:

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

So what using namespace std does so that we can use `cout` without `std::`? Basically, it loads all the symbols in C++ Standard Library and makes them `global` (To understand this you need to have a perfect knowledge of scope, or carry along this blog. I will try to make it more clear).

So now let’s talk about what we learn at the beginning, that using namespace std will load all the standard library symbols as well as make them global. So we can use `cout` in place of `std::cout` as `cout` is now global and we haven’t redefined in inside main function (So only `cout` will work. No need of `::cout`. Thought that will work too). So this is how all this works.

I hope you like reading this blog. If you have any question then feel free to comment below. Also if you like, you can share it with your friends.
