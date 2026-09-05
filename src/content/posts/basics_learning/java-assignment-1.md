---
title: "[OOP (CS 594D)] Assignment 1"
date: "2017-08-06"
description: "Solutions to a first-year OOP assignment in Java: Hello World, command-line arguments, swapping numbers, patterns, and a grading program."
categories: ["Programming", "Java"]
tags: ["Java", "Assignment", "Programming", "Tutorial"]
draft: false
---

![](http://i.imgur.com/HK073Al.jpg)

## Assignment 1

-   **Write a Java program to print “Hello World”.**

*Source code:*

```
public class HelloWorldnormal {

	public static void main(String[] args) {
		System.out.println("Hello World");
	}
}
```

*Output:*

```
$ javac HelloWorldnormal.java

$ java HelloWorldnormal
Hello World
```

-   **Write a Java program to print “Hello World”, where ‘World’ will be taken from a command-line argument.**

*Source code:*

```
public class HelloWorldCLA {

	public static void main(String[] args) {
		System.out.println("Hello " + args[0]);
	}
}
```

*Output:*

```
$ javac HelloWorldCLA.java

$ java HelloWorldCLA World
Hello World
```

-   **Write a Java program to print the sum of two numbers taken from command-line arguments.**

*Source code:*

```
public class SumOf2NumbersCLA {

	public static void main(String[] args) {
		System.out.println("Sum of " + args[0] + " and " + args[1] + " is " + (Integer.parseInt(args[0]) + Integer.parseInt(args[1])));
	}
}
```

*Output:*

```
$ javac SumOf2NumbersCLA.java

$ java SumOf2NumbersCLA 7 8
Sum of 7 and 8 is 15
```

-   **Write a Java program to greet each name passed as a command-line argument, prefixing it with its index, like this:**

```
0 HELLO NAME1
1 HELLO NAME2
2 HELLO NAME3
```

*Source code:*

```
public class Greeting {

	public static void main(String[] args) {
		for (int i = 0; i < args.length; i++) {
			System.out.println(i + " HELLO " + args[i]);
		}
	}
}
```

*Output:*

```
$ javac Greeting.java

$ java Greeting Debakar Baka Dr_NULL
0 HELLO Debakar
1 HELLO Baka
2 HELLO Dr_NULL
```

-   **Write a Java program to swap two numbers entered by the user.**

*Source code:*

```
import java.util.Scanner;

public class Swap2Numbers {

	public static void main(String[] args) {
		Scanner input = new Scanner(System.in);

		System.out.print("\nEnter two numbers: ");
		int a = input.nextInt(), b = input.nextInt();
		input.close();

		System.out.println("\nBefore Swap: a = " + a + ", b = " + b);
		a = a + b;
		b = a - b;
		a = a - b;
		System.out.println("\nAfter Swap: a = " + a + ", b = " + b);
	}
}
```

*Output:*

```
$ javac Swap2Numbers.java

$ java Swap2Numbers

Enter two numbers: 67 54

Before Swap: a = 67, b = 54

After Swap: a = 54, b = 67
```

-   **Write a Java program to print the following number pattern for a given number of lines:**

```
1 2 3 4 5
2 3 4 5
3 4 5
4 5
5
```

*Source code:*

```
import java.util.Scanner;

public class Pattern1 {

	public static void main(String[] args) {
		Scanner input = new Scanner(System.in);

		System.out.print("\nEnter number of line for the pattern: ");
		int n = input.nextInt();
		input.close();

		for (int i = 1; i <= n; i++) {
			for (int j = i; j <= n; j++) {
				System.out.print(j + " ");
			}
			System.out.println();
		}

	}
}
```

*Output:*

```
$ javac Pattern1.java

$ java Pattern1

Enter number of line for the pattern: 5
1 2 3 4 5
2 3 4 5
3 4 5
4 5
5
```

-   **Write a Java program that prints a remark for a student's marks using the following grading scale:**

```
if marks <= 40 - Fail
41 to 50 - Average
51 to 60 - Fair
61 to 70 - Good
71 to 80 - Very good
81 to 90 - Excellent
91 to 100 - Outstanding
```

*Source code:*

```
import java.util.Scanner;

public class RemarkCard {

	public static void main(String[] args) {
		Scanner input = new Scanner(System.in);

		System.out.print("\nEnter the marks of the students: ");
		int marks = input.nextInt();
		input.close();

		if (marks <= 40)
			System.out.println("Fail.");
		else if (marks >= 41 && marks <= 50)
			System.out.println("Average.");
		else if (marks >= 51 && marks <= 60)
			System.out.println("Fair.");
		else if (marks >= 61 && marks <= 70)
			System.out.println("Good.");
		else if (marks >= 71 && marks <= 80)
			System.out.println("Very Good.");
		else if (marks >= 81 && marks <= 90)
			System.out.println("Excellent.");
		else
			System.out.println("Outstanding.");
	}
}
```

*Output:*

```
$ javac RemarkCard.java

$ java RemarkCard

Enter the marks of the students: 95
Outstanding.
```

-   **Write a Java program to print this kind of pattern.**

```
    *
   * *
  * * *
 * * * *
* * * * *
```

*Source code:*

```
import java.util.Scanner;

public class Pattern2 {

	public static void main(String[] args) {
		Scanner input = new Scanner(System.in);

		System.out.println("\nEnter number of line for the pattern: ");
		int n = input.nextInt();
		input.close();

		for (int i = 0; i < n; i++) {
			for (int j = i; j < n - 1; j++) {
				System.out.print(" ");
			}
			for (int j = 0; j <= i; j++) {
				System.out.print("* ");
			}
			System.out.println();
		}
	}
}
```

*Output:*

```
$ javac Pattern2.java

$ java Pattern2

Enter number of line for the pattern: 5
    *
   * *
  * * *
 * * * *
* * * * *
```
