---
title: "Coding Interview: Warm Up"
date: "2019-05-13"
description: "FizzBuzz Link to original Problem on LeetCode Write a program that outputs the string representation of numbers from 1 to n. But for multiples of three, it should output “Fizz” instead of the number and for the multiples of five output “Buzz”. For numbers which are multiples of both three and five output “FizzBuzz”. Example: n = 15, Return: [ “1”, “2”, “Fizz”, “4”, “Buzz”, “Fizz”, “7”, “8”, “Fizz”, “Buzz”, “11”, “Fizz”, “13”, “14”, “FizzBuzz” ]"
categories: ["Algorithms", "Programming", "Interview Preparation"]
tags: ["Coding Interview", "Warmup", "Algorithms", "Programming"]
draft: false
---

### FizzBuzz

[Link to original Problem on LeetCode](https://leetcode.com/problems/fizz-buzz/)

Write a program that outputs the string representation of numbers from 1 to n.

But for multiples of three, it should output “Fizz” instead of the number and for the multiples of five output “Buzz”. For numbers which are multiples of both three and five output “FizzBuzz”.

**Example:**

> n = 15, Return: \[ “1”, “2”, “Fizz”, “4”, “Buzz”, “Fizz”, “7”, “8”, “Fizz”, “Buzz”, “11”, “Fizz”, “13”, “14”, “FizzBuzz” \]

**My Solution:**

```python
class Solution(object):
    def fizzBuzz(self, n):
        """
        :type n: int
        :rtype: List[str]
        """
        return ['Fizz' * (not i % 3) + 'Buzz' * (not i % 5) or str(i) for i in range(1, n + 1)]
```

**Explanation:**

In python, if you multiply any string to an integer you will get the same string repeated the same number of you multiplied it.

```python
>>>'Fizz' * 3
'FizzFizzFizz'
```

Now, in arithmetic, python treats booleans as integers. **True** is treated as *1* and **False** is treated as *0*.

In the code *not i % 3* will return a boolean which then can be multiplied with **Fizz**. Depending on whether the number is divisible by 3 or not we will get the output. The same goes for **Buzz**. If the number is divisible by both 3 and 5 then we are using string concatenation to get **FizzBuzz**.

An empty string is considered False. That’s why we are using **or** in between to make sure if the number is not divisible by either 3 or 5 then use the string typecast version of the number.

We have use string comprehension to do all this in one line.

### Subarray Sum Equals K

[Link to original Problem on LeetCode](https://leetcode.com/problems/subarray-sum-equals-k/)

Given an array of integers and an integer k, you need to find the total number of continuous subarrays whose sum equals to k.

**Example 1:**

> Input:nums = \[1,1,1\], k = 2 Output: 2

Note:

1.  The length of the array is in the range \[1, 20,000\].
2.  The range of numbers in the array is \[-1000, 1000\] and the range of the integer k is \[-1e7, 1e7\].

**My Solution:**

```python
class Solution(object):
    def subarraySum(self, nums, k):
        """
        :type nums: List[int]
        :type k: int
        :rtype: int
        """
        sumNums, countDict, count = 0, {}, 0

        for num in nums:
            sumNums += num
            if sumNums == k:
                count += 1
            if sumNums - k in countDict:
                count += countDict[sumNums - k]
            countDict[sumNums] = countDict.get(sumNums, 0) + 1
        return count
```

**Explanation:**

We are maintaining a variable (*sumNums*) with a cumulative sum up to the index we are looking (up to *i*). Also, a dictionary is maintained with *cumulative sum* as key and their *count* as value.

As an example we can take an array : *\[2, 1, 3, 6, -3, 3, 5, 1\]* The cumulative sum for this array will be: *\[2, 3, 6, 12, 9, 12, 17, 18\]* The dictionary will be: {2: 1, 3: 1, 6: 1, 12: 2, 9: 1, 17: 1, 18: 1} **Let k = 6**

Now if in any point we see the number *k* as cumulative sum, increase the count by 1 (*at index 2*).

Also, we increase the count of each time we found a key equals to *cumulative sum - k*

If we see index 7, it has a *cumulative sum = 18*.

So *cummulative sum - k => 18 - 6* = **12**. We have 12 two time in the dictionary (at index 3 and 5).

So if we take the subarray after those index up to the index 7 (from index **4 to 7** and index **6 to 7** ie. subarray \[-3, 3, 5, 1\] and subarray \[5, 1\]) then we will have a sum of 6.

### Valid Anagram

[Link to original Problem on LeetCode](https://leetcode.com/problems/valid-anagram/)

Given two strings s and t, write a function to determine if t is an anagram of s.

**Example 1:**

> Input: s = “anagram”, t = “nagaram” Output: true

**Example 2:**

> Input: s = “rat”, t = “car” Output: false

Note: You may assume the string contains only lowercase alphabets.

**My Solution:**

```python
class Solution(object):
    def isAnagram(self, s, t):
        """
        :type s: str
        :type t: str
        :rtype: bool
        """
        if len(s) != len(t):
            return False

        sDict, tDict = {}, {}

        for char in s:
            sDict[char] = sDict.get(char, 0) + 1

        for char in t:
            tDict[char] = tDict.get(char, 0) + 1

        return sDict == tDict
```

**Explanation:**

Maintain a dictionary with the count of each letter encountered till now. At the end just return whether the two dictionaries are equal or not.

### Rotate Array

[Link to original Problem on LeetCode](https://leetcode.com/problems/rotate-array/)

Given an array, rotate the array to the right by k steps, where k is non-negative.

**Example 1:**

> Input: \[1,2,3,4,5,6,7\] and k = 3 Output: \[5,6,7,1,2,3,4\] Explanation: rotate 1 steps to the right: \[7,1,2,3,4,5,6\] rotate 2 steps to the right: \[6,7,1,2,3,4,5\] rotate 3 steps to the right: \[5,6,7,1,2,3,4\]

**Example 2:**

> Input: \[-1,-100,3,99\] and k = 2 Output: \[3,99,-1,-100\] Explanation: rotate 1 steps to the right: \[99,-1,-100,3\] rotate 2 steps to the right: \[3,99,-1,-100\]

**My Solution:**

```python
class Solution(object):
    def rotate(self, nums, k):
        """
        :type nums: List[int]
        :type k: int
        :rtype: None Do not return anything, modify nums in-place instead.
        """
        nums[:] = nums[len(nums) - k:] + nums[:len(nums) - k]
```

**Explanation:**

We are using python’s list slicing feature. Here I am slicing the list first from the element which should come first to the very end and then slice it again till the element which should be present in the end of new list. Then just add this two sliced list and assign to same list and return.
