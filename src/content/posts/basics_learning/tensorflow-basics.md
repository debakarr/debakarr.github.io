---
title: "TensorFlow Basic"
date: "2018-01-26"
description: "TensorFlow Basic I made this post for revision purpose. This post contains most of the tensorflow basics and how does they work in a sense. Most of the code is beginner friendly. There is no need for pre-requisite programming knowledge of tensorflow in any sense to go through this notebook, but you should have a basic understanding of Python and how array works in general (also if you have a knowledge of AI, that would be great)."
categories: ["Programming", "Machine Learning", "Python"]
tags: ["TensorFlow", "Basics", "Machine Learning", "Python", "Tutorial"]
draft: false
---

![](https://i.imgur.com/LGi8Wxy.png)

# TensorFlow Basic

*I made this post for revision purpose.* This post contains most of the tensorflow basics and how does they work in a sense. Most of the code is beginner friendly. There is no need for pre-requisite programming knowledge of tensorflow in any sense to go through this notebook, but you should have a basic understanding of Python and how array works in general (also if you have a knowledge of AI, that would be great).

The unit of data in TensorFlow s called a **tensor**. A tensor is basically speaking is a multidimensional arrays (though it is not the case, but still if you look from the perspective of beginner it looks like a multidimensional array). Each tensor have something called **rank** and it is its number of dimensions (Example for this is given in next part).

So first of all at the very beginning we need to import tensorflow to work with the Classes, methods and symbols associated with it. For this below is the code(which is typical code to import a library in Python).

```python
import tensorflow as tf
```

Now we can use all TensorFlow’s classes, methods, and symbols

### Constants

Let’s create a very basic constant. For this TensorFlow used what it calls is a **tensor object**.

```python
tf.constant('Hello World')
```

```
<tf.Tensor 'Const:0' shape=() dtype=string>
```

This is a fundamental String constant. We can also save this as a variable.

```python
hello = tf.constant('Hello World')
```

Let’s see it’s type:

```python
type(hello)
```

```
tensorflow.python.framework.ops.Tensor
```

See, at the very end, we have ‘Tensor’, indicating that it’s an object of Tensor.

We can also create integer constant or float constant.

```python
a = tf.constant(2)

# we can explicitly pass in the data type of the constant
x = tf.constant(3.5, dtype=tf.float32)

# or we can also tf.float32 implicitly
y = tf.constant(5.0)
```

Let’s again check the type.

```python
type(a)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(x)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(y)
```

```
tensorflow.python.framework.ops.Tensor
```

Do you want to print the constants? Let’s try.

```python
print(a, x, y)
```

```
Tensor("Const_2:0", shape=(), dtype=int32) Tensor("Const_3:0", shape=(), dtype=float32) Tensor("Const_4:0", shape=(), dtype=float32)
```

What just happened? Notice this print does not prints:

```python
2 3.5 5.0
```

The thing is that each of the object(sometime called nodes) will be printed if evaluated inside a so-called **session**. A session is something that encapsulate the state and control the TensorFlow runtime. In other word (a bit technical) a session encapsulate the environment in which operation objects are executed. Tensor objects are evaluated in those operation objects.

### Session

To create a session, we need to use a class Session. We can do this in this way.

```python
sess = tf.Session()
```

Now to evaluate nodes inside a session, we must run something called a **computational graph**.

First, let’s talk about the computational graph in general. The computational graph is basically everywhere in computer science. Think of this statement:

**e=(a+b)∗(b+1)**

Here we can see that we have 3 operations, 2 addition and 1 multiplication and the computational graph can be visualized in this manner:

![](https://i.imgur.com/YACuVLV.png)

For more please go through the Computational graph part in [this article](http://colah.github.io/posts/2015-08-Backprop/)

Now if we run a computational graph in a session we will have the desired output. For this, we can use *run()* method.

```python
print(sess.run([a, x, y]))
```

```
[2, 3.5, 5.0]
```

If we check the type of tensor object inside sess.run() we can find that it’s now being evaluated as numpy array.

```python
type(sess.run(a))
```

```
numpy.int32
```

```python
type(sess.run(x))
```

```
numpy.float32
```

Let’s do the same thing with string constant we created earlier.

```python
sess.run(hello)
```

```
b'Hello World'
```

In the above output ‘b’ represents that the string is bytestring. We can check this:

```python
type(sess.run(hello))
```

```
bytes
```

Some extra note: TensorFlow converts str to bytes in most places, including *sess.run()*. When using print with the string constant we get:

```python
print(sess.run(hello))
```

```
b'Hello World'
```

which is not the desired output. We are getting ‘b’ in front of the string(this is because it’s type is byte not str). To get the actual string you can use *decode()* method like this:

```python
print(sess.run(hello).decode())
```

```
Hello World
```

### Operation

Let’s now move to Operations.

We can do multiple operations which includes addition, subtraction, multiplication, division, etc.

```python
x = tf.constant(4)
y = tf.constant(5)
```

```python
with tf.Session() as sess:
    print('Operations on', sess.run(x), 'and', sess.run(y), ':')
    print('Addition:', sess.run(x+y))
    print('Subtraction:', sess.run(x-y))
    print('Multiplication:', sess.run(x*y))
    print('Division:', sess.run(x/y))
```

```
Operations on 4 and 5 :
Addition: 9
Subtraction: -1
Multiplication: 20
Division: 0.8
```

### Placeholder

It’s not like we are always going to work with constant. TensorFlow has another type of object called **placeholder** which can accept a value, and after that, we can do an operation on that value. To create placeholder we will use *tf.placeholder()*. Inside parenthesis, you can put the datatype(or object type for tensor) you want the placeholder to hold.

```python
x = tf.placeholder(tf.int32)
y = tf.placeholder(tf.int32)
```

Other than this there are a bunch of other placeholders. If you are using iPython, then you can explore those by typing ’tf.int’ or ’tf.float’ followed by *tab*.

```python
x
```

```
<tf.Tensor 'Placeholder:0' shape=<unknown> dtype=int32>
```

```python
y
```

```
<tf.Tensor 'Placeholder_1:0' shape=<unknown> dtype=int32>
```

We can see that these are the placeholder and the initial shape is unknow as it does not hold anything initially.

```python
type(x)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(y)
```

```
tensorflow.python.framework.ops.Tensor
```

We can also define operation using tensorflow. Below we have 4 operation tensorflow provides such as tf.add, tf.subtract, tf.divide, tf.multiply. Other then these we have a bunch of other operation (which obviously includes matrix operation) inside TensorFlow.

If you have worked with *lambda* before then, this might seem a bit similar to you where we are defining two parameters first and then the operation to be performed on them.

```python
add = tf.add(x, y)
sub = tf.subtract(x, y)
mul = tf.multiply(x, y)
div = tf.divide(x, y)
```

To evaluate these operations inside run we can use something called a feed\_dict argument. Basically the syntax is that the run method will accept an operation followed by the feed dictionary which tell on what value we have to do the operations. Below we have 4 dictionary containing different values for x and y (key-value pair format).

```python
d1 = {x:5, y:6}
d2 = {x:2, y:8}
d3 = {x:7, y:2}
d4 = {x:9, y:5}
```

Now we can do operation using the placeholder.

```python
with tf.Session() as sess:
    print('Operations with placeholders:')
    print('Addition:', sess.run(add, feed_dict=d1))
    print('Subtraction:', sess.run(sub, feed_dict=d2))
    print('Multiplication:', sess.run(mul, feed_dict=d3))
    print('Division:', sess.run(div, feed_dict=d4))
```

```
Operations with placeholders:
Addition: 11
Subtraction: -6
Multiplication: 14
Division: 1.8
```

Before ending this let’s look at how we are going to do operation on matrix in a very basic level. First we will have to import numpy to create array. Then we will do operation on that array.

```python
import numpy as np
```

```python
# Two array, one of dimension 2 by 3 and other of diension 3 by 2
a = np.array([[6.0, 6.0, 6.0], [2.0, 2.0, 2.0]])
b = np.array([[5.0, 10.0], [5.0, 10.0], [5.0, 10.0]])
```

```python
a.shape
```

```
(2, 3)
```

```python
b.shape
```

```
(3, 2)
```

```python
# Creating TensorFlow constants
mat1 = tf.constant(a)
mat2 = tf.constant(b)
```

```python
# defining operation
matrixMul = tf.matmul(mat1, mat2)
```

```python
# Creating session and running
with tf.Session() as sess:
    print(sess.run(matrixMul))
```

```
[[  90.  180.]
 [  30.   60.]]
```

If you want to explore more, you could (if you are using iPython or an IDE) type ’tf.mat’ followed by *tab* to explore other operation available for the matrix.

Before ending there is one fascinating thing which you might need in future.

For those working with neural network this feature of numpy is quite handy. When we are working with bias. Think of CNN where we have weights (W) and image matrix (X). We have a equation which looks something like this **y = X.W + b**. Here both result of X.W and b have different shape. Then also we can add them using something called broadcasting.

Let’s look few examples

```python
p = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
q = np.array([5.0])
```

```python
p * q
```

```
array([[  5.,  10.,  15.],
       [ 20.,  25.,  30.]])
```

Above 5.0 is multiplied with every line. This feature is quite handy when dealing with situations where the dimensions of parameters to performed operations on do not matches.

Using the same feature in TensorFlow:

```python
x = np.array([[6.0], [6.0]])
```

```python
mat3 = tf.constant(x)
```

```python
with tf.Session() as sess:
    print(sess.run(matrixMul + x))
```

```
[[  96.  186.]
 [  36.   66.]]
```

These are some of the fundamental concepts of TensorFlow which one should know before starting to work with it.

#### What we did

-   We imported TensorFlow as tf.
    
-   You can create constants with TensorFow just by passing in tf.constant and whatever object want to convert to a tensor so that TensorFlow can work with it.
    
-   You can run a session intensively for a specific session just by creating session using tf.Session(). Save it as a variable. And then you can run constant or operations on those constants. We look at some operations, very basic ones such as just adding two numbers together.
    
-   Then we looked at placeholders which allowed us to actually create operations or functions that will take in feed dictionaries in which we can put in placeholder objects and later provide the actual constants that we want to work with. So you can think about it as almost a finding your own function except in this case we are using built-in functions.
    
-   And then we kind of combined those two ideas to created some matrices using numpy and define them as Tensor objects. We called a built-in function matmul() and pass two matrix constants. This time there is no feed dictionary as we are using constants.
    

*Thanks for reading*
