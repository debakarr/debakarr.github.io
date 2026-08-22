---
title: "[LeetCode] 136. Single Number"
date: "2019-07-23"
description: "Single Number Link to original Problem on LeetCode Given a non-empty array of integers, every element appears twice except for one. Find that single one. Note: Your algorithm should have a linear runtime complexity. Could you implement it without using extra memory? Example 1: Input: [2,2,1] Output: 1 Example 2: Input: [4,1,2,1,2] Output: 4 Company: Amazon Solution (Using HashMap): Time Complexity: O(n) Space Complexity: O(n) class Solution(object): def singleNumber(self, nums): \"\"\" :type nums: List[int] :rtype: int \"\"\" # Keep a dictionary count and at the end just check whether any number has a count of 1 numCount = {} for num in nums: numCount[num] = numCount."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Single Number", "LeetCode", "Bit Manipulation", "XOR", "Algorithm", "Python", "Problem Solving"]
draft: false
---

### Single Number

[Link to original Problem on LeetCode](https://leetcode.com/problems/single-number/)

Given a **non-empty** array of integers, every element appears twice except for one. Find that single one.

**Note:**

Your algorithm should have a linear runtime complexity. Could you implement it without using extra memory?

**Example 1:**

Input: \[2,2,1\] Output: 1

**Example 2:**

Input: \[4,1,2,1,2\] Output: 4

**Company:** *Amazon*

**Solution (Using HashMap):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
class Solution(object):
    def singleNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # Keep a dictionary count and at the end just check whether any number has a count of 1
        numCount = {}
        
        for num in nums:
            numCount[num] = numCount.get(num, 0) + 1
            
        for key, value in numCount.items():
            if value == 1:
                return key
```

**Solution (Using Set):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
class Solution(object):
    def singleNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # We know that every number except the number whose count is one is repeated twice
        # Therefore if we multiply all unique number with 2 and then subtract it with the sum of the list we should get our desire output
        return 2 * sum(set(nums)) - sum(nums)
```

**Solution (Using XOR):**

**Time Complexity:** O(n) **Space Complexity:** O(1)

```python
class Solution(object):
    def singleNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # XOR of same elements is zero
        result = 0
        for num in nums:
            result ^= num
        return result
```

**Solution (Using reduce method, only in Python):**

**Time Complexity:** O(n) **Space Complexity:** O(1)

```python
class Solution(object):
    def singleNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # It will perform XOR operator with the list pass to it
        return reduce(operator.xor, nums)
```
